import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Platform,
  Keyboard,
} from "react-native";
import Animated, {
  SlideInUp,
  FadeOut,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from "react-native-reanimated";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";

import CaptureInput from "@/components/CaptureInput";
import TypeChips, { CaptureType } from "@/components/TypeChips";
import TagChips, { CaptureTag, incrementTagUsage } from "@/components/TagChips";
import { Attachment } from "@/components/AttachmentBar";
import ActionBar from "@/components/ActionBar";
import Tooltip from "@/components/Tooltip";
import {
  submitCapture,
  submitMultiCapture,
  transcribeAudioFile,
  CapturePayload,
} from "@/services/api";
import { useLocalSearchParams } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { useShareIntentContext } from "expo-share-intent";
import { parseShareIntent } from "@/services/share-receiver";
import { getAudioDuration, stopRecording as stopRecordingService } from "@/services/audio";
import { startDictation, stopDictation, DictationState, isLagging } from "@/services/dictation";
import { colors, spacing, typography, radii } from "@/theme";

const QUEUE_KEY = "quick-capture-offline-queue";
const DRAFT_KEY = "quick-capture-draft";
const TOOLTIP_KEY = "quick-capture-mic-tooltip-shown";

interface Draft {
  text: string;
  type: CaptureType;
  tags: CaptureTag[];
  attachments: Array<{ type: "image" | "audio"; uri: string; duration?: number }>;
  savedAt: number;
}

export default function CaptureScreen() {
  const [text, setText] = useState("");
  const [type, setType] = useState<CaptureType>("Idea");
  const [tags, setTags] = useState<CaptureTag[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [recording, setRecording] = useState(false);
  const [dictating, setDictating] = useState(false);
  const dictatingRef = useRef(false);
  const recordingRef = useRef(false);
  const { action } = useLocalSearchParams<{ action?: string }>();
  const [lagging, setLagging] = useState(false);
  const [dictationState, setDictationState] = useState<DictationState>("idle");
  const [interimText, setInterimText] = useState("");
  const cursorPos = useRef({ start: 0, end: 0 });
  const [showMicTooltip, setShowMicTooltip] = useState(false);
  const [saving, setSaving] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  // ── Keyboard animation (synced with system 285ms curve) ──
  const { height: kbHeight } = useReanimatedKeyboardAnimation();
  const [flash, setFlash] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  // Keep refs in sync so callbacks always read fresh state
  useEffect(() => { dictatingRef.current = dictating; }, [dictating]);
  useEffect(() => { recordingRef.current = recording; }, [recording]);

  // ── Keyboard tracking ─────────────────────────────────────
  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSub = Keyboard.addListener(showEvent, () => setKeyboardOpen(true));
    const hideSub = Keyboard.addListener(hideEvent, () => setKeyboardOpen(false));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  // ── Shortcut action handling ────────────────────────────
  useEffect(() => {
    if (!action) return;
    const timer = setTimeout(async () => {
      if (action === "voice") {
        handleDictationToggle();
      } else if (action === "paste") {
        const clip = await Clipboard.getStringAsync();
        if (clip) setText((prev) => prev + (prev ? "\n" : "") + clip);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [action]);

  /** Stop any active voice activity (dictation or recording). Returns transcript if dictation was active. */
  const stopVoiceActivity = async (): Promise<string | undefined> => {
    if (dictatingRef.current) {
      const audioUri = await stopDictation();
      setDictating(false);
      if (audioUri) {
        setTranscribing(true);
        setInterimText("transcribing...");
        try {
          const transcript = await transcribeAudioFile(audioUri);
          setInterimText("");
          return transcript || undefined;
        } catch (err: any) {
          console.error("[dictation] transcribe failed:", err);
          setInterimText("");
          showFlash("error", `Transcribe failed: ${err.message || err}`);
        } finally {
          setTranscribing(false);
        }
      }
    }
    if (recordingRef.current) {
      const uri = await stopRecordingService();
      setRecording(false);
      if (uri) {
        const duration = await getAudioDuration(uri);
        setAttachments((prev) => [...prev, { type: "audio", uri, duration }]);
      }
    }
    return undefined;
  };

  // ── Smart type defaults (P9 — Psychological Intent) ──────
  const typeManuallySet = useRef(false);
  const chipsTouched = useRef(false);

  const handleTypeSelect = async (t: CaptureType) => {
    typeManuallySet.current = true;
    chipsTouched.current = true;
    setType(t);
    const transcript = await stopVoiceActivity();
    if (transcript) setText((prev) => prev + (prev ? " " : "") + transcript);
  };

  const autoSelectType = (t: CaptureType) => {
    if (!typeManuallySet.current) setType(t);
  };

  // Auto-select Lookup when a URL is pasted
  const prevTextRef = useRef("");
  useEffect(() => {
    if (!typeManuallySet.current && text !== prevTextRef.current) {
      const urlPattern = /https?:\/\/[^\s]+/;
      if (urlPattern.test(text) && !urlPattern.test(prevTextRef.current)) {
        autoSelectType("Lookup");
      }
    }
    prevTextRef.current = text;
  }, [text]);

  // ── Draft persistence (P5 — Trust Architecture) ──────────
  const draftTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftReady = useRef(false); // prevents saving before restore completes

  // Restore draft on mount — silent, no prompt
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(DRAFT_KEY);
        if (!raw) { draftReady.current = true; return; }
        const draft: Draft = JSON.parse(raw);
        if (draft.text) setText(draft.text);
        if (draft.type) setType(draft.type);
        if (draft.tags?.length) setTags(draft.tags);
        if (draft.attachments?.length) setAttachments(draft.attachments);
      } catch {
        // corrupted draft — ignore
      }
      draftReady.current = true;
    })();
  }, []);

  // Auto-save draft on every change (500ms debounce)
  useEffect(() => {
    if (!draftReady.current) return;

    if (draftTimer.current) clearTimeout(draftTimer.current);
    draftTimer.current = setTimeout(() => {
      const hasContent = text.trim().length > 0 || attachments.length > 0
        || type !== "Idea" || tags.length > 0;
      if (hasContent) {
        const draft: Draft = {
          text,
          type,
          tags,
          attachments: attachments.map((a) => ({
            type: a.type,
            uri: a.uri,
            duration: a.duration,
          })),
          savedAt: Date.now(),
        };
        AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(draft)).catch(() => {});
      } else {
        AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
      }
    }, 500);

    return () => {
      if (draftTimer.current) clearTimeout(draftTimer.current);
    };
  }, [text, type, tags, attachments]);

  // ── Pulse animation (shared by recording dot + transcription mic) ──
  const pulseOpacity = useSharedValue(1);
  const isPulsing = recording || saving || dictating || transcribing;
  useEffect(() => {
    if (isPulsing) {
      pulseOpacity.value = withRepeat(
        withTiming(0.3, { duration: 600, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    } else {
      pulseOpacity.value = withTiming(1, { duration: 150 });
    }
  }, [isPulsing]);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
  }));

  // ── First-use mic tooltip ─────────────────────────────────
  useEffect(() => {
    if (dictating && dictationState === "listening") {
      AsyncStorage.getItem(TOOLTIP_KEY).then((shown) => {
        if (!shown) {
          setShowMicTooltip(true);
          AsyncStorage.setItem(TOOLTIP_KEY, "true").catch(() => {});
        }
      });
    } else {
      setShowMicTooltip(false);
    }
  }, [dictating, dictationState]);


  // ── Lag indicator — polls isLagging() every second while dictating ──
  useEffect(() => {
    if (!dictating) { setLagging(false); return; }
    const interval = setInterval(() => {
      setLagging(isLagging());
    }, 1000);
    return () => clearInterval(interval);
  }, [dictating]);

  // ── Share intent handling (expo-share-intent) ──────────────
  const { hasShareIntent, shareIntent, resetShareIntent } =
    useShareIntentContext();

  useEffect(() => {
    if (!hasShareIntent) return;
    const content = parseShareIntent(shareIntent);
    if (!content) return;

    if (content.text) setText(content.text);
    else if (content.url) setText(content.url);

    if (content.imageUri) {
      setAttachments((prev) => [
        ...prev,
        { type: "image", uri: content.imageUri! },
      ]);
    }

    resetShareIntent();
  }, [hasShareIntent]);

  // Flush offline queue on open
  useEffect(() => {
    flushOfflineQueue();
  }, []);

  // ── Offline queue ─────────────────────────────────────────
  const flushOfflineQueue = async () => {
    try {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      if (!raw) return;

      const queue = JSON.parse(raw) as any[];
      if (queue.length === 0) return;

      const remaining: any[] = [];
      for (const item of queue) {
        try {
          if (item._hasAttachments) {
            await submitMultiCapture(item.payload, item.attachments);
          } else {
            await submitCapture(item);
          }
        } catch {
          remaining.push(item);
        }
      }

      if (remaining.length > 0) {
        await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
      } else {
        await AsyncStorage.removeItem(QUEUE_KEY);
      }
    } catch {
      // silent
    }
  };

  const queueOffline = async (entry: any) => {
    try {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      const queue = raw ? JSON.parse(raw) : [];
      queue.push(entry);
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch {
      // best effort
    }
  };

  // ── Flash feedback ────────────────────────────────────────
  const showFlash = (kind: "success" | "error", message?: string) => {
    const msg =
      kind === "success"
        ? "✓ Captured"
        : message ?? "Couldn't save — tap to retry";
    setFlash({ kind, message: msg });
    if (kind === "success") {
      setTimeout(() => setFlash(null), 1500);
    }
    // Error flash persists until tapped (dismissed in handleFlashTap)
  };

  const handleFlashTap = () => {
    if (flash?.kind === "error") {
      setFlash(null);
      handleSave(); // retry
    }
  };

  // ── Attachment handlers ───────────────────────────────────
  const handleImagePicked = (uri: string) => {
    setAttachments((prev) => {
      const next = [...prev, { type: "image" as const, uri }];
      // Auto-select Image/Scene on first image attachment
      if (!prev.some((a) => a.type === "image")) autoSelectType("Image/Scene");
      return next;
    });
  };

  const handleDictationToggle = async () => {
    if (dictating) {
      const transcript = await stopVoiceActivity();
      if (transcript) {
        // Insert at cursor position
        setText((prev) => {
          const { start, end } = cursorPos.current;
          const before = prev.slice(0, start);
          const after = prev.slice(end);
          const needsSpace = before.length > 0 && !before.endsWith(" ") && !transcript.startsWith(" ");
          const inserted = (needsSpace ? " " : "") + transcript;
          const newPos = start + inserted.length;
          cursorPos.current = { start: newPos, end: newPos };
          return before + inserted + after;
        });
      }
      return;
    }

    setDictating(true);
    await startDictation({
      onInterimText: () => {},
      onFinalText: () => {},
      onUtteranceEnd: () => {},
      onError: (message) => {
        showFlash("error", message);
        setDictating(false);
      },
      onStateChange: (s) => setDictationState(s),
      onFallbackAudio: () => {},
    });
  };

  const handleRecordingStart = () => {
    setRecording(true);
    autoSelectType("Overheard");
  };

  const handleRecordingComplete = async (uri: string) => {
    setRecording(false);
    const duration = await getAudioDuration(uri);
    setAttachments((prev) => [...prev, { type: "audio", uri, duration }]);
  };

  const handleRemoveAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  // ── Save ──────────────────────────────────────────────────
  const handleSave = async () => {
    // In-recording Capture: tap stops voice, transcribes, then saves in one shot.
    // Fire haptic immediately on tap so the user gets confirmation before the
    // transcribe roundtrip — separate from the haptic below for normal saves.
    const attemptedVoice = dictatingRef.current || recordingRef.current;
    let appendedTranscript: string | undefined;
    if (attemptedVoice) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      appendedTranscript = await stopVoiceActivity();
    }

    // Compute final text from current text + any newly transcribed content.
    // Don't rely on `text` state after setText — setState is async; use the
    // local merged value for both setText (UI) and the save payload.
    // End-append (not cursor-insert) is intentional: when the user taps Capture
    // mid-recording they're committing the whole capture, so cursor position
    // is irrelevant. The two-tap flow (mic→edit→capture) still uses cursor
    // insertion via handleDictationToggle.
    let finalText = text;
    if (appendedTranscript) {
      const needsSpace =
        finalText.length > 0 &&
        !finalText.endsWith(" ") &&
        !appendedTranscript.startsWith(" ");
      finalText = finalText + (needsSpace ? " " : "") + appendedTranscript;
      setText(finalText);
    }

    const content = finalText.trim();
    const hasContent = content.length > 0 || attachments.length > 0;
    if (!hasContent) {
      // User tapped Capture mid-recording but nothing usable came back.
      // stopVoiceActivity already shows a flash for transcribe failures;
      // surface our own for the silent-empty case (e.g. no speech detected).
      // showFlash overwrites the existing flash, which is desirable here:
      // "Nothing captured" is the actionable message at this point.
      if (attemptedVoice) {
        showFlash("error", "Nothing captured — tap mic and try again");
      }
      return;
    }

    Keyboard.dismiss();
    setSaving(true);
    if (!appendedTranscript) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    // Build title from text or attachment description
    let title: string;
    if (content.length > 0) {
      title = content.length > 60 ? content.substring(0, 57) + "..." : content;
    } else if (attachments.some((a) => a.type === "audio")) {
      title = `🎙 Voice note — ${new Date().toLocaleDateString()}`;
    } else {
      title = `📷 Image — ${new Date().toLocaleDateString()}`;
    }

    const payload: CapturePayload = {
      title,
      notes: content,
      type,
      tags,
      priority: "🟢 Low",
      autoClassify: !chipsTouched.current,
    };

    // Auto-populate Next Step for Lookup captures
    if (type === "Lookup" && !content.toLowerCase().includes("next step")) {
      payload.nextStep = "Research: find source/reference and update this capture";
    }

    try {
      if (attachments.length > 0) {
        await submitMultiCapture(payload, attachments);
      } else {
        await submitCapture(payload);
      }
      incrementTagUsage(tags);
      showFlash("success");
      resetForm();
    } catch (err) {
      // Queue for offline sync — if queuing fails, show error with retry
      try {
        if (attachments.length > 0) {
          await queueOffline({
            _hasAttachments: true,
            payload,
            attachments: attachments.map((a) => ({
              type: a.type,
              uri: a.uri,
              duration: a.duration,
            })),
          });
        } else {
          await queueOffline(payload);
        }
        incrementTagUsage(tags);
        showFlash("success"); // queued = success from user's perspective
        resetForm();
      } catch {
        const reason =
          err instanceof Error ? err.message : "Something went wrong";
        showFlash("error", `Couldn't save — ${reason}`);
        // Don't reset form — user can retry
      }
    } finally {
      setSaving(false);
    }
  };

  const toggleTag = useCallback(async (tag: CaptureTag) => {
    chipsTouched.current = true;
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
    const transcript = await stopVoiceActivity();
    if (transcript) setText((prev) => prev + (prev ? " " : "") + transcript);
  }, []);

  const resetForm = () => {
    setText("");
    setType("Idea");
    setTags([]);
    setAttachments([]);
    typeManuallySet.current = false;
    chipsTouched.current = false;
    AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
  };

  const canSave =
    (text.trim().length > 0 || attachments.length > 0 || dictating || recording) && !saving;

  // Animated style: the whole content area shifts up with the keyboard
  const kbAnimatedStyle = useAnimatedStyle(() => ({
    paddingBottom: -kbHeight.value, // kbHeight is negative, so negate it
  }));

  return (
    <SafeAreaView style={styles.safe}>
        <View style={[styles.container, keyboardOpen && styles.containerCompact]}>
        {/* Header — shrinks when keyboard is open */}
        <View style={[styles.header, keyboardOpen && styles.headerCompact]}>
          <Text style={[styles.title, keyboardOpen && styles.titleCompact]}>capture</Text>
          {/* Status badges */}
          {recording && !dictating && (
            <View style={styles.recordingBadge}>
              <Animated.View style={[styles.recordingDot, pulseStyle]} />
              <Text style={styles.recordingText}>recording</Text>
            </View>
          )}
          {transcribing && (
            <View style={styles.recordingBadge}>
              <Animated.View style={[styles.recordingDot, { backgroundColor: colors.accent.primary }, pulseStyle]} />
              <Text style={[styles.recordingText, { color: colors.accent.primary }]}>transcribing</Text>
            </View>
          )}
        </View>

        {/* Flash feedback — slide-in entrance, fade-out exit */}
        {flash && (
          <Animated.View
            entering={SlideInUp.duration(250)}
            exiting={FadeOut.duration(400)}
            style={[
              styles.flash,
              flash.kind === "success"
                ? styles.flashSuccess
                : styles.flashError,
            ]}
          >
            <Text
              onPress={flash.kind === "error" ? handleFlashTap : undefined}
              style={[
                styles.flashText,
                {
                  color:
                    flash.kind === "success"
                      ? colors.feedback.successText
                      : colors.feedback.errorText,
                },
              ]}
            >
              {flash.message}
            </Text>
          </Animated.View>
        )}

        {/* Text input — attachments live inside the box */}
        <View style={[styles.inputArea, keyboardOpen && styles.inputAreaCompact]}>
          <CaptureInput
            value={text}
            onChangeText={setText}
            editable={!saving}
            interimText={interimText}
            onCursorChange={(pos) => { cursorPos.current = pos; }}
            dictating={dictating}
            dictationActive={dictationState === "listening"}
            compact={keyboardOpen}
            attachments={attachments}
            onRemoveAttachment={handleRemoveAttachment}
          />
        </View>

        {/* Lag indicator — shown when transcription results are delayed */}
        {lagging && (
          <Text style={styles.laggingText}>catching up...</Text>
        )}

        {/* Transcribing indicator — pulsing mic + contextual text */}
        {saving && (
          <View style={styles.processingRow}>
            <Animated.Text style={[styles.processingMic, pulseStyle]}>
              {attachments.some((a) => a.type === "audio") ? "●" : "→"}
            </Animated.Text>
            <Text style={styles.processingText}>
              {attachments.some((a) => a.type === "audio")
                ? "Listening to your voice note..."
                : "Capturing..."}
            </Text>
          </View>
        )}

        {/* Bottom section — slides up in sync with keyboard */}
        <Animated.View style={kbAnimatedStyle}>
          {/* Metadata chips */}
          <View style={[styles.metadata, keyboardOpen && styles.metadataCompact]}>
            <TypeChips selected={type} onSelect={handleTypeSelect} disabled={saving} compact={keyboardOpen} />
            <TagChips selected={tags} onToggle={toggleTag} disabled={saving} compact={keyboardOpen} />
          </View>

          {/* Action bar: camera, gallery, mic, save */}
          <View style={{ position: "relative" }}>
            <ActionBar
              recording={recording}
              dictating={dictating}
              busy={saving}
              canSave={canSave}
              onImagePicked={handleImagePicked}
              onRecordingStart={handleRecordingStart}
              onRecordingComplete={handleRecordingComplete}
              onDictationToggle={handleDictationToggle}
              onSave={handleSave}
            />
            <Tooltip
              text="hold for audio"
              visible={showMicTooltip}
              onDismiss={() => setShowMicTooltip(false)}
            />
          </View>
        </Animated.View>
        </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg.base,
    borderWidth: 1,
    borderColor: colors.accent.primary,
  },
  container: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  containerCompact: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: spacing.xxl,
  },
  headerCompact: {
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.text.primary,
    fontSize: typography.size.display,
    fontFamily: typography.family.display,
    fontWeight: typography.weight.normal,
    fontStyle: "italic",
    letterSpacing: typography.tracking.tight,
  },
  titleCompact: {
    fontSize: typography.size.xl,
  },
  recordingBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  recordingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.recording,
  },
  recordingText: {
    color: colors.recording,
    fontSize: typography.size.xs,
    fontFamily: typography.family.mono,
    letterSpacing: typography.tracking.extraWide,
    textTransform: "uppercase",
  },
  flash: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.sm,
    marginBottom: spacing.lg,
    alignItems: "center",
    backgroundColor: "transparent",
    borderWidth: 1,
  },
  flashSuccess: {
    borderColor: colors.feedback.successText,
  },
  flashError: {
    borderColor: colors.feedback.errorText,
  },
  flashText: {
    fontSize: typography.size.md,
    fontFamily: typography.family.mono,
    letterSpacing: typography.tracking.wide,
  },
  inputArea: {
    flex: 1,
    marginBottom: spacing.lg,
  },
  inputAreaCompact: {
    marginBottom: spacing.xs,
  },
  laggingText: {
    color: colors.text.muted,
    fontSize: typography.size.xs,
    fontStyle: "italic",
    textAlign: "center",
    marginBottom: spacing.sm,
  },
  processingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  processingMic: {
    fontSize: typography.size.base,
    color: colors.accent.primary,
  },
  processingText: {
    color: colors.text.secondary,
    fontSize: typography.size.md,
    fontStyle: "italic",
  },
  metadata: {
    marginBottom: spacing.sm,
  },
  metadataCompact: {
    marginBottom: 0,
  },
});

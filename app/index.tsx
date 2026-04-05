import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
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
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";

import CaptureInput from "@/components/CaptureInput";
import TypeChips, { CaptureType } from "@/components/TypeChips";
import TagChips, { CaptureTag, incrementTagUsage } from "@/components/TagChips";
import AttachmentBar, { Attachment } from "@/components/AttachmentBar";
import ActionBar from "@/components/ActionBar";
import {
  submitCapture,
  submitMultiCapture,
  CapturePayload,
} from "@/services/api";
import { getSharedContent, onSharedContent } from "@/services/share-receiver";
import { getAudioDuration } from "@/services/audio";
import { colors, spacing, typography, radii } from "@/theme";

const QUEUE_KEY = "quick-capture-offline-queue";
const DRAFT_KEY = "quick-capture-draft";

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
  const [saving, setSaving] = useState(false);
  const [flash, setFlash] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);

  // ── Smart type defaults (P9 — Psychological Intent) ──────
  const typeManuallySet = useRef(false);

  const handleTypeSelect = (t: CaptureType) => {
    typeManuallySet.current = true;
    setType(t);
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
  const isPulsing = recording || saving;
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

  // ── Share intent handling ──────────────────────────────────
  useEffect(() => {
    (async () => {
      const shared = await getSharedContent();
      if (shared) applySharedContent(shared);
    })();

    const unsub = onSharedContent((content) => applySharedContent(content));
    return unsub;
  }, []);

  const applySharedContent = (content: {
    text?: string;
    url?: string;
    imageUri?: string;
    type: string;
  }) => {
    if (content.text) setText(content.text);
    else if (content.url) setText(content.url);

    if (content.imageUri) {
      setAttachments((prev) => [
        ...prev,
        { type: "image", uri: content.imageUri! },
      ]);
    }
  };

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
    const content = text.trim();
    const hasContent = content.length > 0 || attachments.length > 0;
    if (!hasContent) return;

    Keyboard.dismiss();
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

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

  const toggleTag = useCallback((tag: CaptureTag) => {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }, []);

  const resetForm = () => {
    setText("");
    setType("Idea");
    setTags([]);
    setAttachments([]);
    typeManuallySet.current = false;
    AsyncStorage.removeItem(DRAFT_KEY).catch(() => {});
  };

  const canSave =
    (text.trim().length > 0 || attachments.length > 0) && !saving;

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>capture</Text>
          {recording && (
            <View style={styles.recordingBadge}>
              <Animated.View style={[styles.recordingDot, pulseStyle]} />
              <Text style={styles.recordingText}>recording</Text>
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

        {/* Text input — always visible */}
        <View style={styles.inputArea}>
          <CaptureInput value={text} onChangeText={setText} />
        </View>

        {/* Attachment previews */}
        <AttachmentBar
          attachments={attachments}
          onRemove={handleRemoveAttachment}
        />

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

        {/* Metadata chips */}
        <View style={styles.metadata}>
          <TypeChips selected={type} onSelect={handleTypeSelect} />
          <TagChips selected={tags} onToggle={toggleTag} />
        </View>

        {/* Action bar: camera, gallery, mic, save */}
        <ActionBar
          recording={recording}
          busy={saving}
          canSave={canSave}
          onImagePicked={handleImagePicked}
          onRecordingStart={handleRecordingStart}
          onRecordingComplete={handleRecordingComplete}
          onSave={handleSave}
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bg.base,
  },
  container: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.sm,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: spacing.xxl,
  },
  title: {
    color: colors.text.primary,
    fontSize: typography.size.display,
    fontFamily: typography.family.display,
    fontWeight: typography.weight.normal,
    fontStyle: "italic",
    letterSpacing: typography.tracking.tight,
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
});

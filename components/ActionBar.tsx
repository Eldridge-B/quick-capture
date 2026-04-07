import React, { useRef } from "react";
import { View, Text, StyleSheet, Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { colors, spacing, radii, typography, shadows } from "@/theme";
import { startRecording, stopRecording } from "@/services/audio";
import AnimatedPressable from "@/components/AnimatedPressable";

/** Mic icon built from text — a filled circle on a stem */
function MicIcon({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <View style={{ alignItems: "center", justifyContent: "center" }}>
      <View
        style={{
          width: size * 0.5,
          height: size * 0.65,
          borderRadius: size * 0.25,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          width: 1.5,
          height: size * 0.2,
          backgroundColor: color,
          marginTop: 1,
        }}
      />
      <View
        style={{
          width: size * 0.45,
          height: 1.5,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

interface ActionBarProps {
  recording: boolean;
  dictating: boolean;
  busy: boolean;
  canSave: boolean;
  onImagePicked: (uri: string) => void;
  onRecordingStart: () => void;
  onRecordingComplete: (uri: string) => void;
  onDictationToggle: () => void;
  onSave: () => void;
}

export default function ActionBar({
  recording,
  dictating,
  busy,
  canSave,
  onImagePicked,
  onRecordingStart,
  onRecordingComplete,
  onDictationToggle,
  onSave,
}: ActionBarProps) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const didLongPress = useRef(false);

  const handlePickImage = async () => {
    if (recording || busy) return;

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("One more thing", "Quick Capture needs photo access to attach images.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.8,
      allowsEditing: false,
    });

    if (!result.canceled && result.assets[0]) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onImagePicked(result.assets[0].uri);
    }
  };

  const handleCamera = async () => {
    if (recording || busy) return;

    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("One more thing", "Quick Capture needs camera access to take photos.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      quality: 0.8,
      allowsEditing: false,
    });

    if (!result.canceled && result.assets[0]) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onImagePicked(result.assets[0].uri);
    }
  };

  const handleMicPressIn = () => {
    if (busy) return;
    if (dictating || recording) return;

    didLongPress.current = false;
    longPressTimer.current = setTimeout(async () => {
      didLongPress.current = true;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      const started = await startRecording();
      if (started) onRecordingStart();
    }, 500);
  };

  const handleMicPressOut = () => {
    if (busy) return;

    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }

    if (recording) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      stopRecording().then((uri) => {
        if (uri) onRecordingComplete(uri);
      });
      return;
    }

    if (dictating) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onDictationToggle();
      return;
    }

    if (!didLongPress.current) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onDictationToggle();
    }
  };

  return (
    <View style={styles.bar}>
      {/* Left: typographic action marks */}
      <View style={styles.attachGroup}>
        <AnimatedPressable
          style={[styles.actionBtn, (recording || busy) && styles.actionBtnDisabled]}
          onPress={handleCamera}
          disabled={recording || busy}
        >
          <MaterialCommunityIcons name="camera-outline" size={19} color={colors.text.secondary} />
        </AnimatedPressable>

        <AnimatedPressable
          style={[styles.actionBtn, (recording || busy) && styles.actionBtnDisabled]}
          onPress={handlePickImage}
          disabled={recording || busy}
        >
          <MaterialCommunityIcons name="image-multiple-outline" size={19} color={colors.text.secondary} />
        </AnimatedPressable>

        <AnimatedPressable
          style={[
            styles.actionBtn,
            dictating && styles.micDictating,
            recording && styles.micRecording,
            busy && !recording && !dictating && styles.actionBtnDisabled,
          ]}
          onPressIn={handleMicPressIn}
          onPressOut={handleMicPressOut}
          disabled={busy && !recording && !dictating}
        >
          {recording ? (
            <Text style={[styles.actionGlyph, styles.micGlyphRecording]}>◼</Text>
          ) : (
            <MicIcon color={dictating ? colors.accent.primary : colors.text.secondary} size={20} />
          )}
        </AnimatedPressable>
      </View>

      {/* Right: capture button */}
      <AnimatedPressable
        pressScale={0.98}
        style={[
          styles.saveBtn,
          canSave && !recording && shadows.glow,
          (!canSave || recording) && styles.saveBtnDisabled,
        ]}
        onPress={onSave}
        disabled={!canSave || recording}
      >
        <Text style={styles.saveBtnText}>
          {busy ? "capturing" : "capture"}
        </Text>
        <Text style={styles.saveBtnArrow}>→</Text>
      </AnimatedPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
  },
  attachGroup: {
    flexDirection: "row",
    gap: spacing.md,
  },
  actionBtn: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    backgroundColor: colors.bg.raised,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnDisabled: {
    opacity: 0.25,
  },
  micDictating: {
    borderColor: colors.accent.primary,
  },
  micRecording: {
    backgroundColor: "transparent",
    borderColor: colors.recording,
  },
  actionGlyph: {
    fontSize: 18,
    color: colors.text.secondary,
  },
  micGlyphRecording: {
    color: colors.recording,
    fontSize: 14,
  },
  saveBtn: {
    backgroundColor: "transparent",
    borderWidth: 1.5,
    borderColor: colors.accent.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
    borderRadius: radii.md,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  saveBtnDisabled: {
    opacity: 0.25,
  },
  saveBtnText: {
    color: colors.accent.primary,
    fontSize: typography.size.base,
    fontWeight: typography.weight.semibold,
    letterSpacing: typography.tracking.wide,
  },
  saveBtnArrow: {
    color: colors.accent.primary,
    fontSize: typography.size.lg,
    fontWeight: typography.weight.normal,
    opacity: 0.6,
  },
});

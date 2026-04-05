import React from "react";
import { View, Text, StyleSheet, Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { colors, spacing, radii, typography, shadows } from "@/theme";
import { startRecording, stopRecording } from "@/services/audio";
import AnimatedPressable from "@/components/AnimatedPressable";

interface ActionBarProps {
  recording: boolean;
  busy: boolean;
  canSave: boolean;
  onImagePicked: (uri: string) => void;
  onRecordingStart: () => void;
  onRecordingComplete: (uri: string) => void;
  onSave: () => void;
}

export default function ActionBar({
  recording,
  busy,
  canSave,
  onImagePicked,
  onRecordingStart,
  onRecordingComplete,
  onSave,
}: ActionBarProps) {
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

  const handleMicPress = async () => {
    if (busy) return;

    if (!recording) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const started = await startRecording();
      if (started) onRecordingStart();
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const uri = await stopRecording();
      if (uri) onRecordingComplete(uri);
    }
  };

  return (
    <View style={styles.bar}>
      {/* Left: attachment buttons */}
      <View style={styles.attachGroup}>
        <AnimatedPressable
          style={[styles.actionBtn, (recording || busy) && styles.actionBtnDisabled]}
          onPress={handleCamera}
          disabled={recording || busy}
        >
          <Text style={styles.actionIcon}>📷</Text>
        </AnimatedPressable>

        <AnimatedPressable
          style={[styles.actionBtn, (recording || busy) && styles.actionBtnDisabled]}
          onPress={handlePickImage}
          disabled={recording || busy}
        >
          <Text style={styles.actionIcon}>🖼</Text>
        </AnimatedPressable>

        <AnimatedPressable
          style={[
            styles.actionBtn,
            recording && styles.micRecording,
            busy && !recording && styles.actionBtnDisabled,
          ]}
          onPress={handleMicPress}
          disabled={busy && !recording}
        >
          <Text style={styles.actionIcon}>{recording ? "⏹" : "🎙"}</Text>
        </AnimatedPressable>
      </View>

      {/* Right: save button */}
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
          {busy ? "Capturing..." : "Capture ⚡"}
        </Text>
      </AnimatedPressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.sm,
  },
  attachGroup: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  actionBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.bg.raised,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    alignItems: "center",
    justifyContent: "center",
  },
  actionBtnDisabled: {
    opacity: 0.35,
  },
  micRecording: {
    backgroundColor: colors.recording,
    borderColor: colors.recording,
  },
  actionIcon: {
    fontSize: typography.size.xl,
  },
  saveBtn: {
    backgroundColor: colors.accent.primary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radii.pill,
    alignItems: "center",
  },
  saveBtnDisabled: {
    opacity: 0.35,
  },
  saveBtnText: {
    color: colors.text.inverse,
    fontSize: typography.size.base,
    fontWeight: typography.weight.bold,
  },
});

import React from "react";
import { TextInput, StyleSheet, View, Text } from "react-native";
import { colors, spacing, radii, typography } from "@/theme";

interface CaptureInputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  ref?: React.Ref<TextInput>;
}

export default function CaptureInput({
  value,
  onChangeText,
  placeholder,
  ref,
}: CaptureInputProps) {
  const charCount = value.length;

  return (
    <View style={styles.container}>
      <TextInput
        ref={ref}
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? "What's on your mind?"}
        placeholderTextColor={colors.text.muted}
        multiline
        textAlignVertical="top"
        autoFocus
        selectionColor={colors.accent.primary}
      />
      {charCount > 0 && <Text style={styles.charCount}>{charCount}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: "relative",
  },
  input: {
    flex: 1,
    color: colors.text.primary,
    fontSize: typography.size.lg,
    lineHeight: typography.lineHeight.relaxed,
    padding: spacing.lg,
    backgroundColor: colors.bg.raised,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    minHeight: 120,
    maxHeight: 300,
  },
  charCount: {
    position: "absolute",
    bottom: spacing.sm,
    right: spacing.md,
    color: colors.text.muted,
    fontSize: typography.size.xs,
  },
});

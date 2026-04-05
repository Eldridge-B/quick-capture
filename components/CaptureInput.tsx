import React, { useState } from "react";
import { TextInput, StyleSheet, View, Text } from "react-native";
import { colors, spacing, radii, typography } from "@/theme";

interface CaptureInputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  ref?: React.Ref<TextInput>;
  editable?: boolean;
  interimText?: string;
  onCursorChange?: (pos: { start: number; end: number }) => void;
}

export default function CaptureInput({
  value,
  onChangeText,
  placeholder,
  ref,
  editable,
  interimText,
  onCursorChange,
}: CaptureInputProps) {
  const [focused, setFocused] = useState(false);
  const charCount = value.length;

  const handleSelectionChange = (e: any) => {
    const { start, end } = e.nativeEvent.selection;
    onCursorChange?.({ start, end });
  };

  return (
    <View style={styles.container}>
      <TextInput
        ref={ref}
        style={[styles.input, focused && styles.inputFocused]}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? "what's on your mind..."}
        placeholderTextColor={colors.text.muted}
        multiline
        textAlignVertical="top"
        autoFocus
        selectionColor={colors.accent.primary}
        cursorColor={colors.accent.primary}
        onSelectionChange={handleSelectionChange}
        editable={editable !== false}
        keyboardAppearance="dark"
      />
      {interimText ? (
        <Text style={styles.interimText}>{interimText}</Text>
      ) : null}
      {charCount > 0 && (
        <Text style={styles.charCount}>{charCount}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: "relative",
  },
  input: {
    flexShrink: 1,
    flexGrow: 1,
    color: colors.text.primary,
    fontSize: typography.size.lg,
    fontFamily: typography.family.body,
    lineHeight: typography.lineHeight.relaxed,
    padding: spacing.xl,
    paddingTop: spacing.xxl,
    backgroundColor: colors.bg.raised,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    minHeight: 60,
  },
  inputFocused: {
    borderColor: colors.accent.primary,
  },
  charCount: {
    position: "absolute",
    bottom: spacing.md,
    right: spacing.lg,
    color: colors.text.muted,
    fontSize: typography.size.xs,
    fontFamily: typography.family.mono,
    letterSpacing: typography.tracking.wide,
  },
  interimText: {
    color: colors.accent.primary,
    fontSize: typography.size.md,
    fontStyle: "italic",
    opacity: 0.6,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xs,
  },
});

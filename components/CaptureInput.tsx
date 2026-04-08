import React, { useState } from "react";
import { TextInput, StyleSheet, View, Text, useWindowDimensions } from "react-native";
import { colors, spacing, radii, typography } from "@/theme";
import Waveform from "@/components/Waveform";
import AttachmentBar, { Attachment } from "@/components/AttachmentBar";

interface CaptureInputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  ref?: React.Ref<TextInput>;
  editable?: boolean;
  interimText?: string;
  onCursorChange?: (pos: { start: number; end: number }) => void;
  dictating?: boolean;
  dictationActive?: boolean;
  compact?: boolean;
  attachments?: Attachment[];
  onRemoveAttachment?: (index: number) => void;
}

export default function CaptureInput({
  value,
  onChangeText,
  placeholder,
  ref,
  editable,
  interimText,
  onCursorChange,
  dictating,
  dictationActive,
  compact,
  attachments,
  onRemoveAttachment,
}: CaptureInputProps) {
  const [focused, setFocused] = useState(false);
  const { height: screenHeight } = useWindowDimensions();
  const charCount = value.length;
  const hasAttachments = attachments && attachments.length > 0;
  // Cap text box at ~45% of screen so chips + action bar always stay visible
  const maxInputHeight = Math.round(screenHeight * 0.45);

  const handleSelectionChange = (e: any) => {
    const { start, end } = e.nativeEvent.selection;
    onCursorChange?.({ start, end });
  };

  return (
    <View style={styles.container}>
      <TextInput
        ref={ref}
        style={[styles.input, { maxHeight: maxInputHeight }, focused && styles.inputFocused, compact && styles.inputCompact]}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? "what's on your mind..."}
        placeholderTextColor={colors.text.muted}
        multiline
        scrollEnabled
        textAlignVertical="top"
        autoFocus
        selectionColor={colors.accent.primary}
        cursorColor={colors.accent.primary}
        onSelectionChange={handleSelectionChange}
        editable={editable !== false}
        keyboardAppearance="dark"
      />
      {dictating && (
        <View style={styles.waveformContainer}>
          <Waveform active={dictationActive ?? false} />
        </View>
      )}
      {interimText ? (
        <Text style={styles.interimText}>{interimText}</Text>
      ) : null}
      {hasAttachments && onRemoveAttachment && (
        <View style={styles.attachmentContainer}>
          <AttachmentBar
            attachments={attachments}
            onRemove={onRemoveAttachment}
            compact={compact}
          />
        </View>
      )}
      {charCount > 0 && !dictating && !hasAttachments && (
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
  inputCompact: {
    padding: spacing.md,
    paddingTop: spacing.lg,
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
  waveformContainer: {
    position: "absolute",
    top: spacing.md,
    right: spacing.md,
    zIndex: 1,
  },
  attachmentContainer: {
    position: "absolute",
    bottom: spacing.sm,
    left: spacing.sm,
    zIndex: 2,
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

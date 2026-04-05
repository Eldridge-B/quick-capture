import React from "react";
import { View, Text, Image, StyleSheet, ScrollView } from "react-native";
import { colors, spacing, radii, typography } from "@/theme";
import AnimatedPressable from "@/components/AnimatedPressable";

export interface Attachment {
  type: "image" | "audio";
  uri: string;
  duration?: number;
}

interface AttachmentBarProps {
  attachments: Attachment[];
  onRemove: (index: number) => void;
}

export default function AttachmentBar({
  attachments,
  onRemove,
}: AttachmentBarProps) {
  if (attachments.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      {attachments.map((att, i) => (
        <View key={`${att.type}-${i}`} style={styles.card}>
          {att.type === "image" ? (
            <Image source={{ uri: att.uri }} style={styles.thumbnail} />
          ) : (
            <View style={styles.audioPreview}>
              <Text style={styles.audioGlyph}>●</Text>
              <Text style={styles.audioDuration}>
                {att.duration ? formatDuration(att.duration) : "audio"}
              </Text>
            </View>
          )}
          <AnimatedPressable
            pressScale={1}
            pressOpacity={0.6}
            style={styles.removeBtn}
            onPress={() => onRemove(i)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.removeBtnText}>×</Text>
          </AnimatedPressable>
        </View>
      ))}
    </ScrollView>
  );
}

function formatDuration(s: number) {
  const min = Math.floor(s / 60);
  const sec = s % 60;
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.sm,
    flexShrink: 0,
  },
  content: {
    gap: spacing.sm,
    paddingHorizontal: spacing.xxs,
  },
  card: {
    width: 56,
    height: 56,
    borderRadius: radii.sm,
    backgroundColor: colors.bg.raised,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    overflow: "hidden",
    position: "relative",
  },
  thumbnail: {
    width: "100%",
    height: "100%",
    resizeMode: "cover",
  },
  audioPreview: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  audioGlyph: {
    fontSize: 20,
    color: colors.accent.primary,
  },
  audioDuration: {
    color: colors.text.secondary,
    fontSize: typography.size.xs,
    fontFamily: typography.family.mono,
    letterSpacing: typography.tracking.wide,
  },
  removeBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: radii.sm,
    backgroundColor: colors.bg.overlay,
    alignItems: "center",
    justifyContent: "center",
  },
  removeBtnText: {
    color: colors.text.primary,
    fontSize: 12,
    fontWeight: typography.weight.normal,
  },
});

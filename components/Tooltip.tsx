import React, { useEffect } from "react";
import { Text, StyleSheet } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { colors, spacing, radii, typography } from "@/theme";

interface TooltipProps {
  text: string;
  visible: boolean;
  onDismiss: () => void;
  autoDismissMs?: number;
}

export default function Tooltip({
  text,
  visible,
  onDismiss,
  autoDismissMs = 3000,
}: TooltipProps) {
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(onDismiss, autoDismissMs);
    return () => clearTimeout(timer);
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(200)}
      style={styles.container}
    >
      <Text style={styles.text}>{text}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: -28,
    right: 0,
    backgroundColor: colors.bg.elevated,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: radii.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  text: {
    color: colors.text.secondary,
    fontSize: typography.size.xs,
    fontFamily: typography.family.mono,
    letterSpacing: typography.tracking.wide,
  },
});

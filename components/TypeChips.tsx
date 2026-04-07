import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { spacing, commonStyles } from "@/theme";
import CardStack, { CardStackItem } from "@/components/CardStack";

const CAPTURE_TYPES = [
  "Idea",
  "Observation",
  "Moment",
  "Emotion",
  "Question",
  "Overheard",
  "Image/Scene",
  "Dream",
  "Lookup",
] as const;

export type CaptureType = (typeof CAPTURE_TYPES)[number];

const TYPE_ITEMS: CardStackItem[] = CAPTURE_TYPES.map((t) => ({
  key: t,
  label: t,
}));

interface TypeChipsProps {
  selected: CaptureType;
  onSelect: (type: CaptureType) => void;
  disabled?: boolean;
  compact?: boolean;
}

export default function TypeChips({ selected, onSelect, disabled, compact }: TypeChipsProps) {
  return (
    <View style={[styles.container, compact && styles.containerCompact, disabled && styles.disabled]}>
      {!compact && <Text style={commonStyles.sectionLabel}>type</Text>}
      <CardStack
        items={TYPE_ITEMS}
        selectedKeys={[selected]}
        onSelect={(key) => onSelect(key as CaptureType)}
        compact={compact}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  containerCompact: {
    marginBottom: spacing.xs,
  },
  disabled: {
    opacity: 0.4,
    pointerEvents: "none" as const,
  },
});

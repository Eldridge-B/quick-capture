import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { colors, spacing, typography, commonStyles } from "@/theme";
import AnimatedPressable from "@/components/AnimatedPressable";

/**
 * These match the ⚡ Captures database "Type" select property exactly.
 */
const CAPTURE_TYPES = [
  { label: "Idea", icon: "💡" },
  { label: "Observation", icon: "👁" },
  { label: "Moment", icon: "✨" },
  { label: "Emotion", icon: "🫀" },
  { label: "Question", icon: "❓" },
  { label: "Overheard", icon: "👂" },
  { label: "Image/Scene", icon: "🎨" },
  { label: "Dream", icon: "🌙" },
  { label: "Lookup", icon: "🔍" },
] as const;

export type CaptureType = (typeof CAPTURE_TYPES)[number]["label"];

interface TypeChipsProps {
  selected: CaptureType;
  onSelect: (type: CaptureType) => void;
}

export default function TypeChips({ selected, onSelect }: TypeChipsProps) {
  return (
    <View style={styles.container}>
      <Text style={commonStyles.sectionLabel}>Type</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chipRow}>
          {CAPTURE_TYPES.map(({ label, icon }) => (
            <AnimatedPressable
              key={label}
              style={[
                commonStyles.chip,
                selected === label && commonStyles.chipSelected,
              ]}
              onPress={() => onSelect(label)}
            >
              <Text style={styles.chipIcon}>{icon}</Text>
              <Text
                style={[
                  commonStyles.chipText,
                  selected === label && commonStyles.chipTextSelected,
                ]}
              >
                {label}
              </Text>
            </AnimatedPressable>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  chipRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: 2,
  },
  chipIcon: {
    fontSize: typography.size.md,
  },
});

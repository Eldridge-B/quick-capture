import React from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import { colors, spacing, typography, commonStyles } from "@/theme";
import AnimatedPressable from "@/components/AnimatedPressable";

/**
 * Capture types — matched to the Notion database.
 * No emoji. Just words.
 */
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

interface TypeChipsProps {
  selected: CaptureType;
  onSelect: (type: CaptureType) => void;
}

export default function TypeChips({ selected, onSelect }: TypeChipsProps) {
  return (
    <View style={styles.container}>
      <Text style={commonStyles.sectionLabel}>type</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chipRow}>
          {CAPTURE_TYPES.map((label) => (
            <AnimatedPressable
              key={label}
              style={[
                commonStyles.chip,
                selected === label && commonStyles.chipSelected,
              ]}
              onPress={() => onSelect(label)}
            >
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
    gap: spacing.xs,
    paddingHorizontal: 2,
  },
});

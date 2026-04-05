import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors, spacing, commonStyles } from "@/theme";
import AnimatedPressable from "@/components/AnimatedPressable";

/**
 * These match the ⚡ Captures database "Tags" multi_select property exactly.
 */
const CAPTURE_TAGS = [
  "Daughters",
  "School",
  "Writing Material",
  "Gut Health",
  "Attachment",
  "House/Property",
  "Meditation",
  "Reading",
  "Nature",
] as const;

export type CaptureTag = (typeof CAPTURE_TAGS)[number];

export const TAG_USAGE_KEY = "quick-capture-tag-usage";
const VISIBLE_COUNT = 4;

interface TagUsage {
  [tag: string]: number;
}

interface TagChipsProps {
  selected: CaptureTag[];
  onToggle: (tag: CaptureTag) => void;
}

export default function TagChips({ selected, onToggle }: TagChipsProps) {
  const [expanded, setExpanded] = useState(false);
  const [usage, setUsage] = useState<TagUsage | null>(null); // null = loading

  // Load usage data on mount
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(TAG_USAGE_KEY);
        setUsage(raw ? JSON.parse(raw) : {});
      } catch {
        setUsage({});
      }
    })();
  }, []);

  // While loading, show all tags to avoid flash
  if (usage === null) {
    return renderChips(CAPTURE_TAGS as unknown as CaptureTag[], selected, onToggle, null, false, () => {});
  }

  const hasUsageData = Object.values(usage).some((v) => v > 0);

  // First-time user (no usage data) — show all, no collapse
  if (!hasUsageData) {
    return renderChips(CAPTURE_TAGS as unknown as CaptureTag[], selected, onToggle, null, false, () => {});
  }

  // Sort tags by usage frequency (descending)
  const sorted = [...CAPTURE_TAGS].sort(
    (a, b) => (usage[b] ?? 0) - (usage[a] ?? 0)
  );

  if (expanded) {
    return renderChips(sorted, selected, onToggle, null, false, () => {});
  }

  // Collapsed: top N + any selected that aren't in top N
  const topTags = sorted.slice(0, VISIBLE_COUNT);
  const hiddenSelected = selected.filter((t) => !topTags.includes(t));
  const visibleTags = [...topTags, ...hiddenSelected];
  // Deduplicate (in case a selected tag is also in top N)
  const uniqueVisible = [...new Set(visibleTags)];
  const hiddenCount = CAPTURE_TAGS.length - uniqueVisible.length;

  return renderChips(uniqueVisible, selected, onToggle, hiddenCount, true, () => setExpanded(true));
}

function renderChips(
  tags: CaptureTag[],
  selected: CaptureTag[],
  onToggle: (tag: CaptureTag) => void,
  hiddenCount: number | null,
  showExpander: boolean,
  onExpand: () => void,
) {
  return (
    <View style={styles.container}>
      <Text style={commonStyles.sectionLabel}>Tags (optional)</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chipRow}>
          {tags.map((tag) => {
            const isSelected = selected.includes(tag);
            return (
              <AnimatedPressable
                key={tag}
                style={[
                  commonStyles.chip,
                  isSelected && styles.chipSelectedAlt,
                ]}
                onPress={() => onToggle(tag)}
              >
                <Text
                  style={[
                    commonStyles.chipText,
                    isSelected && commonStyles.chipTextSelected,
                  ]}
                >
                  {tag}
                </Text>
              </AnimatedPressable>
            );
          })}
          {showExpander && hiddenCount !== null && hiddenCount > 0 && (
            <AnimatedPressable
              style={[commonStyles.chip, styles.expanderChip]}
              onPress={onExpand}
            >
              <Text style={[commonStyles.chipText, styles.expanderText]}>
                +{hiddenCount} more
              </Text>
            </AnimatedPressable>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

/** Increment usage counts for the given tags. Call on successful save. */
export async function incrementTagUsage(tags: CaptureTag[]) {
  if (tags.length === 0) return;
  try {
    const raw = await AsyncStorage.getItem(TAG_USAGE_KEY);
    const usage: TagUsage = raw ? JSON.parse(raw) : {};
    for (const tag of tags) {
      usage[tag] = (usage[tag] ?? 0) + 1;
    }
    await AsyncStorage.setItem(TAG_USAGE_KEY, JSON.stringify(usage));
  } catch {
    // best effort
  }
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  chipRow: {
    flexDirection: "row",
    gap: spacing.sm,
    paddingHorizontal: 2,
    flexWrap: "wrap",
  },
  chipSelectedAlt: {
    backgroundColor: colors.accent.tertiary,
    borderColor: colors.border.selectedAlt,
  },
  expanderChip: {
    borderStyle: "dashed" as any,
  },
  expanderText: {
    color: colors.text.secondary,
  },
});

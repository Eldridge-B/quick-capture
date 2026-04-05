import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors, spacing, radii, typography } from "@/theme";
import AnimatedPressable from "@/components/AnimatedPressable";

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
  const [usage, setUsage] = useState<TagUsage | null>(null);

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

  if (usage === null) {
    return renderChips(CAPTURE_TAGS as unknown as CaptureTag[], selected, onToggle, null, false, () => {});
  }

  const hasUsageData = Object.values(usage).some((v) => v > 0);

  if (!hasUsageData) {
    return renderChips(CAPTURE_TAGS as unknown as CaptureTag[], selected, onToggle, null, false, () => {});
  }

  const sorted = [...CAPTURE_TAGS].sort(
    (a, b) => (usage[b] ?? 0) - (usage[a] ?? 0)
  );

  if (expanded) {
    return renderChips(sorted, selected, onToggle, null, false, () => {});
  }

  const topTags = sorted.slice(0, VISIBLE_COUNT);
  const hiddenSelected = selected.filter((t) => !topTags.includes(t));
  const uniqueVisible = [...new Set([...topTags, ...hiddenSelected])];
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
      <Text style={styles.sectionLabel}>tags</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.chipRow}>
          {tags.map((tag) => {
            const isSelected = selected.includes(tag);
            return (
              <AnimatedPressable
                key={tag}
                style={[styles.tag, isSelected && styles.tagSelected]}
                onPress={() => onToggle(tag)}
              >
                <Text style={[styles.tagText, isSelected && styles.tagTextSelected]}>
                  {tag.toLowerCase()}
                </Text>
              </AnimatedPressable>
            );
          })}
          {showExpander && hiddenCount !== null && hiddenCount > 0 && (
            <AnimatedPressable style={[styles.tag, { borderStyle: "dashed" as any }]} onPress={onExpand}>
              <Text style={styles.expanderText}>+{hiddenCount}</Text>
            </AnimatedPressable>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

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
  sectionLabel: {
    color: colors.text.muted,
    fontSize: typography.size.xs,
    fontWeight: typography.weight.medium,
    textTransform: "uppercase" as const,
    letterSpacing: typography.tracking.extraWide,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
  chipRow: {
    flexDirection: "row",
    gap: spacing.md,
    paddingHorizontal: 2,
  },
  tag: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    borderRadius: radii.sm,
  },
  tagSelected: {
    borderColor: colors.accent.primary,
  },
  tagText: {
    color: colors.text.muted,
    fontSize: typography.size.md,
    fontFamily: typography.family.mono,
    letterSpacing: typography.tracking.normal,
  },
  tagTextSelected: {
    color: colors.accent.primary,
  },
  expanderText: {
    color: colors.text.secondary,
    fontSize: typography.size.md,
    fontFamily: typography.family.mono,
  },
});

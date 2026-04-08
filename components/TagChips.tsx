import React, { useState, useEffect, useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors, spacing, typography, commonStyles } from "@/theme";
import CardStack from "@/components/CardStack";
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
  "Coding",
] as const;

export type CaptureTag = (typeof CAPTURE_TAGS)[number];

const TAG_USAGE_KEY = "quick-capture-tag-usage";
const VISIBLE_COUNT = 4;

interface TagUsage {
  [tag: string]: number;
}

interface TagChipsProps {
  selected: CaptureTag[];
  onToggle: (tag: CaptureTag) => void;
  disabled?: boolean;
  compact?: boolean;
}

export default function TagChips({ selected, onToggle, disabled, compact }: TagChipsProps) {
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

  const { visibleItems, hiddenCount } = useMemo(() => {
    const allTags = [...CAPTURE_TAGS] as CaptureTag[];
    const hasUsageData = usage && Object.values(usage).some((v) => v > 0);

    const sorted = hasUsageData
      ? allTags.sort((a, b) => ((usage?.[b] ?? 0) - (usage?.[a] ?? 0)))
      : allTags;

    if (expanded || !hasUsageData) {
      return {
        visibleItems: sorted.map((t) => ({ key: t, label: t.toLowerCase() })),
        hiddenCount: 0,
      };
    }

    const topTags = sorted.slice(0, VISIBLE_COUNT);
    const hiddenSelected = selected.filter((t) => !topTags.includes(t));
    const uniqueVisible = [...new Set([...topTags, ...hiddenSelected])];
    const hidden = CAPTURE_TAGS.length - uniqueVisible.length;

    return {
      visibleItems: uniqueVisible.map((t) => ({ key: t, label: t.toLowerCase() })),
      hiddenCount: hidden,
    };
  }, [usage, expanded, selected]);

  if (usage === null) {
    const allItems = (CAPTURE_TAGS as unknown as CaptureTag[]).map((t) => ({
      key: t,
      label: t.toLowerCase(),
    }));
    return (
      <View style={[styles.container, compact && styles.containerCompact, disabled && styles.disabled]}>
        {!compact && <Text style={commonStyles.sectionLabel}>tags</Text>}
        <CardStack
          items={allItems}
          selectedKeys={selected}
          onSelect={(key) => onToggle(key as CaptureTag)}
          multiSelect
          compact={compact}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, compact && styles.containerCompact, disabled && styles.disabled]}>
      {!compact && <Text style={commonStyles.sectionLabel}>tags</Text>}
      <View style={styles.row}>
        <CardStack
          items={visibleItems}
          selectedKeys={selected}
          onSelect={(key) => onToggle(key as CaptureTag)}
          multiSelect
          compact={compact}
        />
        {!expanded && hiddenCount > 0 && (
          <AnimatedPressable style={styles.expander} onPress={() => setExpanded(true)}>
            <Text style={styles.expanderText}>+{hiddenCount}</Text>
          </AnimatedPressable>
        )}
      </View>
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
  container: { marginBottom: spacing.md },
  containerCompact: { marginBottom: spacing.xs },
  row: { flexDirection: "row", alignItems: "center" },
  expander: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginLeft: spacing.sm,
  },
  expanderText: {
    color: colors.text.secondary,
    fontSize: typography.size.md,
    fontFamily: typography.family.mono,
  },
  disabled: { opacity: 0.4, pointerEvents: "none" as const },
});

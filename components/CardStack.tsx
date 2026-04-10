import React, { useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  NativeSyntheticEvent,
  NativeScrollEvent,
  useWindowDimensions,
} from "react-native";
import { colors, spacing, radii, typography } from "@/theme";
import AnimatedPressable from "@/components/AnimatedPressable";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface CardStackItem {
  key: string;
  label: string;
}

interface CardStackProps {
  items: CardStackItem[];
  selectedKeys: string[];
  onSelect: (key: string) => void;
  multiSelect?: boolean;
  compact?: boolean;
}

// ─── Layout constants ─────────────────────────────────────────────────────────

const CARD_WIDTH = 120;
const CARD_GAP = 10;
const SNAP_INTERVAL = CARD_WIDTH + CARD_GAP;
const CONTAINER_PAD = 40;

// ─── Main component ──────────────────────────────────────────────────────────

export default function CardStack({
  items,
  selectedKeys,
  onSelect,
  multiSelect = false,
  compact = false,
}: CardStackProps) {
  const scrollRef = useRef<ScrollView>(null);
  const activeIndex = useRef(0);
  const { width: screenWidth } = useWindowDimensions();

  // Trailing spacer so every card (including last) can reach the leftmost position
  const trailingSpacer = Math.max(0, screenWidth - CONTAINER_PAD - CARD_WIDTH);

  // For single-select: scroll to current selection on mount
  useEffect(() => {
    if (multiSelect) return;
    const idx = items.findIndex((i) => selectedKeys.includes(i.key));
    if (idx > 0) {
      setTimeout(() => {
        scrollRef.current?.scrollTo({ x: idx * SNAP_INTERVAL, animated: false });
      }, 50);
    }
  }, []);

  // When scroll snaps, auto-select the frontmost card (single-select only)
  const handleScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const x = e.nativeEvent.contentOffset.x;
      const index = Math.round(x / SNAP_INTERVAL);
      const clamped = Math.max(0, Math.min(index, items.length - 1));

      if (clamped !== activeIndex.current) {
        activeIndex.current = clamped;
        if (!multiSelect) {
          onSelect(items[clamped].key);
        }
      }
    },
    [items, multiSelect, onSelect]
  );

  // Tap: multi-select toggles in place, single-select scrolls to card + selects
  const handleTap = useCallback(
    (key: string, index: number) => {
      if (multiSelect) {
        onSelect(key);
      } else {
        onSelect(key);
        activeIndex.current = index;
        scrollRef.current?.scrollTo({ x: index * SNAP_INTERVAL, animated: true });
      }
    },
    [multiSelect, onSelect]
  );

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      snapToInterval={SNAP_INTERVAL}
      decelerationRate="fast"
      onMomentumScrollEnd={handleScrollEnd}
      contentContainerStyle={styles.scrollContent}
    >
      {items.map((item, index) => {
        const isSelected = selectedKeys.includes(item.key);

        return (
          <AnimatedPressable
            key={item.key}
            style={[
              styles.card,
              compact && styles.cardCompact,
              isSelected ? styles.cardSelected : styles.cardUnselected,
            ]}
            onPress={() => handleTap(item.key, index)}
            pressScale={0.93}
          >
            <Text
              style={[
                styles.cardText,
                compact && styles.cardTextCompact,
                isSelected ? styles.cardTextSelected : styles.cardTextUnselected,
              ]}
              numberOfLines={1}
            >
              {item.label.toUpperCase()}
            </Text>
          </AnimatedPressable>
        );
      })}
      <View style={{ width: trailingSpacer }} />
    </ScrollView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scrollContent: {
    gap: CARD_GAP,
    paddingHorizontal: 2,
  },
  card: {
    width: CARD_WIDTH,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radii.sm,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  cardCompact: {
    paddingVertical: spacing.sm,
  },
  cardSelected: {
    backgroundColor: colors.accent.tertiary,
    borderColor: colors.accent.primary,
  },
  cardUnselected: {
    backgroundColor: colors.bg.raised,
    borderColor: colors.border.subtle,
  },
  cardText: {
    fontSize: typography.size.md,
    fontFamily: typography.family.mono,
    letterSpacing: typography.tracking.wide,
    textTransform: "uppercase",
  },
  cardTextCompact: {
    fontSize: typography.size.sm,
  },
  cardTextSelected: {
    color: colors.accent.primary,
    fontWeight: typography.weight.semibold,
  },
  cardTextUnselected: {
    color: colors.text.muted,
  },
});

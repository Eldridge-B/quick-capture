import React, { useRef, useCallback, useMemo, useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, LayoutChangeEvent } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";
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

const ANIMATION_DURATION = 200;
const ANIMATION_EASING = Easing.out(Easing.ease);

/**
 * Visible pixels for cards at each stack position.
 *
 * Position 0 = selected (front). Its width is measured at runtime so we use
 * a sentinel here; it is never used in offset computation.
 * Position 1+: how many px remain visible (peeking) behind the card in front.
 */
const VISIBLE_PX: readonly number[] = [
  9999, // pos 0 — sentinel, not used in offset math
  55,   // pos 1: ~45% covered
  35,   // pos 2: ~60% covered
  18,   // pos 3: ~80% covered
  10,   // pos 4+: ~90% covered (sliver)
];

const OPACITIES: readonly number[] = [1.0, 0.8, 0.6, 0.35, 0.35];

// ─── Offset math ──────────────────────────────────────────────────────────────

/**
 * Compute the absolute x offset for a card at `positionIndex`.
 *
 * The selected card (pos 0) is at x = 0.
 * Card at pos 1 starts right after the full selected card: x = cardWidth.
 * Card at pos N starts at: cardWidth + sum(VISIBLE_PX[1] ... VISIBLE_PX[N-1])
 */
function computeX(positionIndex: number, cardWidth: number): number {
  if (positionIndex === 0) return 0;
  let x = cardWidth;
  for (let i = 1; i < positionIndex; i++) {
    const idx = Math.min(i, VISIBLE_PX.length - 1);
    x += VISIBLE_PX[idx];
  }
  return x;
}

// ─── Per-card animated wrapper ────────────────────────────────────────────────

interface AnimatedCardProps {
  item: CardStackItem;
  positionIndex: number;
  isSelected: boolean;
  cardWidth: number;
  onPress: () => void;
  onMeasured?: (width: number) => void;
  compact?: boolean;
}

function AnimatedCard({
  item,
  positionIndex,
  isSelected,
  cardWidth,
  onPress,
  onMeasured,
  compact,
}: AnimatedCardProps) {
  const clampedPos = Math.min(positionIndex, OPACITIES.length - 1);

  const xAnim = useSharedValue(computeX(positionIndex, cardWidth));
  const opacityAnim = useSharedValue(OPACITIES[clampedPos]);

  useEffect(() => {
    const newClamp = Math.min(positionIndex, OPACITIES.length - 1);
    xAnim.value = withTiming(computeX(positionIndex, cardWidth), {
      duration: ANIMATION_DURATION,
      easing: ANIMATION_EASING,
    });
    opacityAnim.value = withTiming(OPACITIES[newClamp], {
      duration: ANIMATION_DURATION,
      easing: ANIMATION_EASING,
    });
  }, [positionIndex, cardWidth]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: xAnim.value }],
    opacity: opacityAnim.value,
  }));

  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      onMeasured?.(e.nativeEvent.layout.width);
    },
    [onMeasured]
  );

  return (
    <Animated.View
      style={[styles.cardAbsolute, animatedStyle]}
      onLayout={onMeasured ? handleLayout : undefined}
    >
      <AnimatedPressable
        onPress={onPress}
        style={[
          styles.card,
          compact && styles.cardCompact,
          isSelected ? styles.cardSelected : styles.cardUnselected,
        ]}
        pressScale={0.95}
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
    </Animated.View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CardStack({
  items,
  selectedKeys,
  onSelect,
  multiSelect = false,
  compact = false,
}: CardStackProps) {
  const scrollRef = useRef<ScrollView>(null);

  // For single-select: track display order so tapped card snaps to front.
  // For multi-select: order stays fixed (cards toggle highlight in place).
  const [order, setOrder] = useState<string[]>(() => items.map((i) => i.key));

  // Sync order when items list changes (keys added/removed externally)
  useEffect(() => {
    setOrder((prev) => {
      const newKeySet = new Set(items.map((i) => i.key));
      const prevKeySet = new Set(prev);
      const retained = prev.filter((k) => newKeySet.has(k));
      const added = items.map((i) => i.key).filter((k) => !prevKeySet.has(k));
      return [...retained, ...added];
    });
  }, [items]);

  const handlePress = useCallback(
    (key: string) => {
      if (!multiSelect) {
        setOrder((prev) => {
          if (prev[0] === key) return prev;
          return [key, ...prev.filter((k) => k !== key)];
        });
        scrollRef.current?.scrollTo({ x: 0, animated: true });
      }
      onSelect(key);
    },
    [multiSelect, onSelect]
  );

  // key → current position index
  const positionMap = useMemo(() => {
    const map: Record<string, number> = {};
    order.forEach((key, idx) => {
      map[key] = idx;
    });
    return map;
  }, [order]);

  // Measure card width from the first card so we can compute absolute offsets
  const [cardWidth, setCardWidth] = useState(0);

  const handleMeasured = useCallback((width: number) => {
    setCardWidth((prev) => (prev === 0 ? width : prev));
  }, []);

  // Total container width for the ScrollView's content
  const containerWidth = useMemo(() => {
    if (cardWidth === 0 || items.length === 0) return undefined;
    let total = cardWidth;
    for (let i = 1; i < items.length; i++) {
      const idx = Math.min(i, VISIBLE_PX.length - 1);
      total += VISIBLE_PX[idx];
    }
    return total;
  }, [cardWidth, items.length]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={[
        styles.scrollContent,
        compact && styles.scrollContentCompact,
      ]}
    >
      <View
        style={[
          styles.stackContainer,
          containerWidth !== undefined && { width: containerWidth },
        ]}
      >
        {items.map((item, itemIndex) => {
          const positionIndex = positionMap[item.key] ?? itemIndex;
          const isSelected = selectedKeys.includes(item.key);

          return (
            <AnimatedCard
              key={item.key}
              item={item}
              positionIndex={positionIndex}
              isSelected={isSelected}
              cardWidth={cardWidth}
              onPress={() => handlePress(item.key)}
              onMeasured={itemIndex === 0 && cardWidth === 0 ? handleMeasured : undefined}
              compact={compact}
            />
          );
        })}
      </View>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  scrollContent: {
    paddingHorizontal: 2,
    paddingBottom: 2,
  },
  scrollContentCompact: {
    paddingBottom: 0,
  },
  stackContainer: {
    position: "relative",
    minHeight: 40,
  },
  cardAbsolute: {
    position: "absolute",
    top: 0,
  },
  card: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.sm,
    borderWidth: 1,
  },
  cardCompact: {
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
  },
  cardSelected: {
    backgroundColor: "transparent",
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
  },
  cardTextCompact: {
    fontSize: typography.size.sm,
  },
  cardTextSelected: {
    color: colors.accent.primary,
  },
  cardTextUnselected: {
    color: colors.text.muted,
  },
});

import React, { useEffect } from "react";
import { View, StyleSheet } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
} from "react-native-reanimated";
import { colors, spacing } from "@/theme";

const BAR_COUNT = 24;
const BAR_WIDTH = 2;
const BAR_GAP = 2;
const MAX_HEIGHT = 24;
const MIN_HEIGHT = 3;

interface WaveformProps {
  active: boolean;
}

export default function Waveform({ active }: WaveformProps) {
  return (
    <View style={styles.container}>
      {Array.from({ length: BAR_COUNT }).map((_, i) => (
        <WaveBar key={i} index={i} active={active} />
      ))}
    </View>
  );
}

function WaveBar({ index, active }: { index: number; active: boolean }) {
  const height = useSharedValue(MIN_HEIGHT);

  useEffect(() => {
    if (active) {
      // Each bar gets a slightly different duration and delay for organic feel
      const duration = 300 + Math.random() * 400;
      const delay = index * 30 + Math.random() * 80;
      const targetHeight = MIN_HEIGHT + Math.random() * (MAX_HEIGHT - MIN_HEIGHT);

      height.value = withDelay(
        delay,
        withRepeat(
          withTiming(targetHeight, {
            duration,
            easing: Easing.inOut(Easing.ease),
          }),
          -1,
          true
        )
      );
    } else {
      height.value = withTiming(MIN_HEIGHT, { duration: 200 });
    }
  }, [active]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: height.value,
  }));

  return <Animated.View style={[styles.bar, animatedStyle]} />;
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: BAR_GAP,
    height: MAX_HEIGHT + 4,
    paddingVertical: 2,
  },
  bar: {
    width: BAR_WIDTH,
    borderRadius: 1,
    backgroundColor: colors.accent.primary,
  },
});

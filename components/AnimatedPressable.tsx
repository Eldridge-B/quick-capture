import React from "react";
import { Pressable, PressableProps, ViewStyle, StyleProp } from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import { animation } from "@/theme";

const AnimatedPressableBase = Animated.createAnimatedComponent(Pressable);

interface AnimatedPressableProps extends Omit<PressableProps, "style"> {
  style?: StyleProp<ViewStyle>;
  /** Scale factor when pressed (default 0.97) */
  pressScale?: number;
  /** Opacity when pressed — applied in addition to scale (default 1.0) */
  pressOpacity?: number;
}

const SPRING_CONFIG = {
  damping: 15,
  stiffness: 300,
  mass: 0.8,
  overshootClamping: false,
  restDisplacementThreshold: 0.01,
  restSpeedThreshold: 0.01,
};

export default function AnimatedPressable({
  style,
  pressScale = 0.97,
  pressOpacity = 1,
  onPressIn,
  onPressOut,
  children,
  disabled,
  ...rest
}: AnimatedPressableProps) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const handlePressIn = (e: any) => {
    scale.value = withSpring(pressScale, SPRING_CONFIG);
    if (pressOpacity < 1) {
      opacity.value = withSpring(pressOpacity, SPRING_CONFIG);
    }
    onPressIn?.(e);
  };

  const handlePressOut = (e: any) => {
    scale.value = withSpring(1, SPRING_CONFIG);
    if (pressOpacity < 1) {
      opacity.value = withSpring(1, SPRING_CONFIG);
    }
    onPressOut?.(e);
  };

  return (
    <AnimatedPressableBase
      style={[animatedStyle, style]}
      onPressIn={disabled ? undefined : handlePressIn}
      onPressOut={disabled ? undefined : handlePressOut}
      disabled={disabled}
      {...rest}
    >
      {children}
    </AnimatedPressableBase>
  );
}

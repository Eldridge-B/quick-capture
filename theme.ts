/**
 * Quick Capture — Design Tokens
 *
 * "Quiet Studio" — warm minimal, typographic, artsy.
 * Think: an artist's dark workspace. Copper light on charcoal.
 *
 * To reskin the app: change values here. Nothing else should need to change.
 */

import { Platform } from "react-native";

export const colors = {
  // Backgrounds (warm charcoal layers)
  bg: {
    base: "#1a1917",       // warm near-black
    raised: "#23221f",     // cards, inputs
    elevated: "#2d2c28",   // focus states, modals
    overlay: "rgba(26, 25, 23, 0.88)",
  },

  // Accents
  accent: {
    primary: "#c8956c",    // copper/terracotta — warm, artsy
    secondary: "#8b7355",  // muted earth — selected tags
    tertiary: "#3d3830",   // subtle highlight bg
  },

  // Text
  text: {
    primary: "#e8e0d4",    // warm parchment white
    secondary: "#9a8f80",  // warm stone
    muted: "#5c554a",      // faded earth
    inverse: "#1a1917",    // dark on accent
  },

  // Feedback
  feedback: {
    success: "#2a3325",
    successText: "#8baa7a",
    error: "#3a2525",
    errorText: "#c47070",
  },

  // Borders
  border: {
    subtle: "#2d2c28",
    focus: "#c8956c",
    selected: "#c8956c",
    selectedAlt: "#8b7355",
  },

  // Semantic
  recording: "#c47070",
} as const;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radii = {
  sm: 4,
  md: 6,
  lg: 8,
  pill: 8,
  circle: 32,
  button: 36,
} as const;

export const typography = {
  size: {
    xs: 10,
    sm: 11,
    md: 13,
    base: 15,
    lg: 17,
    xl: 20,
    xxl: 26,
    display: 32,
  },

  weight: {
    normal: "400" as const,
    medium: "500" as const,
    semibold: "600" as const,
    bold: "700" as const,
    heavy: "800" as const,
  },

  lineHeight: {
    tight: 20,
    normal: 24,
    relaxed: 30,
  },

  // Letter spacing for labels and headers
  tracking: {
    tight: -0.5,
    normal: 0,
    wide: 1.5,
    extraWide: 3,
  },

  // System serif for display, system sans for body
  family: {
    display: Platform.select({
      ios: "Georgia",
      android: "serif",
      default: "serif",
    }) as string,
    body: Platform.select({
      ios: "System",
      android: "sans-serif",
      default: "sans-serif",
    }) as string,
    mono: Platform.select({
      ios: "Menlo",
      android: "monospace",
      default: "monospace",
    }) as string,
  },
} as const;

export const shadows = {
  glow: {
    shadowColor: "#c8956c",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 8,
  },

  card: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
} as const;

export const animation = {
  fast: 150,
  normal: 250,
  slow: 400,
  pulse: 600,
} as const;

/**
 * Common style fragments.
 */
export const commonStyles = {
  // Type chips — outlined, mellow by default, bright when selected
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm + 2,
    borderRadius: radii.sm,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },

  chipSelected: {
    borderColor: colors.accent.primary,
  },

  chipText: {
    color: colors.text.muted,
    fontSize: typography.size.md,
    fontWeight: typography.weight.medium,
    letterSpacing: typography.tracking.wide,
    textTransform: "uppercase" as const,
  },

  chipTextSelected: {
    color: colors.accent.primary,
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
} as const;

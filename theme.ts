/**
 * Quick Capture — Design Tokens
 *
 * All visual constants live here. Components import from this file
 * instead of hardcoding colors, spacing, radii, or typography.
 *
 * To reskin the app: change values here. Nothing else should need to change.
 * To add light mode: create a second token set and swap via context.
 */

export const colors = {
  // Backgrounds (layered from deepest to surface)
  bg: {
    base: "#0f0f1a",       // app background
    raised: "#16213e",     // cards, inputs, chips
    elevated: "#1c2a4a",   // hover/focus states, modals
    overlay: "rgba(15, 15, 26, 0.85)", // overlays
  },

  // Accents
  accent: {
    primary: "#e94560",    // save button, recording indicator, key actions
    secondary: "#533483",  // selected tags, secondary highlights
    tertiary: "#0f3460",   // active mode toggle, selected chips bg
  },

  // Text
  text: {
    primary: "#e8e8f0",    // main content
    secondary: "#a0a0bb",  // labels, hints
    muted: "#5c5c7a",      // placeholders, char count, disabled
    inverse: "#ffffff",    // text on accent backgrounds
  },

  // Feedback
  feedback: {
    success: "#1b4332",
    successText: "#6bcb8b",
    error: "#6b1d1d",
    errorText: "#f28b8b",
  },

  // Borders
  border: {
    subtle: "#2a2a4a",     // default borders
    focus: "#e94560",      // focused input
    selected: "#e94560",   // selected type chip
    selectedAlt: "#533483", // selected tag chip
  },

  // Semantic
  recording: "#e94560",
} as const;

export const spacing = {
  /** Tight internal padding (toggle pills, etc.) */
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
} as const;

export const radii = {
  sm: 8,
  md: 12,
  lg: 16,
  pill: 20,
  circle: 32,
  /** Half of mic button size — keeps it round */
  button: 36,
} as const;

export const typography = {
  // Sizes
  size: {
    xs: 11,
    sm: 12,
    md: 13,
    base: 15,
    lg: 17,
    xl: 20,
    xxl: 24,
    /** Mic button icon */
    icon: 30,
  },

  // Weights (React Native string format)
  weight: {
    normal: "400" as const,
    medium: "500" as const,
    semibold: "600" as const,
    bold: "700" as const,
    heavy: "800" as const,
  },

  // Line heights
  lineHeight: {
    tight: 20,
    normal: 24,
    relaxed: 28,
  },
} as const;

export const shadows = {
  /** Soft glow for the save button */
  glow: {
    shadowColor: "#e94560",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },

  /** Subtle lift for cards */
  card: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
} as const;

export const animation = {
  /** Duration in ms */
  fast: 150,
  normal: 250,
  slow: 400,
  pulse: 600,
} as const;

/**
 * Common style fragments reusable across components.
 */
export const commonStyles = {
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.bg.raised,
    borderWidth: 1,
    borderColor: colors.border.subtle,
  },

  chipSelected: {
    backgroundColor: colors.accent.tertiary,
    borderColor: colors.border.selected,
  },

  chipText: {
    color: colors.text.muted,
    fontSize: typography.size.md,
    fontWeight: typography.weight.medium,
  },

  chipTextSelected: {
    color: colors.text.inverse,
  },

  sectionLabel: {
    color: colors.text.secondary,
    fontSize: typography.size.sm,
    fontWeight: typography.weight.semibold,
    textTransform: "uppercase" as const,
    letterSpacing: 1,
    marginBottom: spacing.sm,
    marginLeft: spacing.xs,
  },
} as const;

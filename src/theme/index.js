// AmpliFood Design System
// Burnt orange, tomato red, butter yellow, cream and ink black, sampled from the
// AmpliFood logos and mood board. UI uses one accent: the burnt orange.
import { UI_FONTS } from '../platform/rn-shim/fonts';

export { UI_FONTS };

export const TEXT_SCALES = {
  small: 0.875,
  default: 1,
  large: 1.15,
  xlarge: 1.3,
};

export const brand = {
  burntOrange: '#EB6A1C',
  tomato: '#E2261F',
  butter: '#F6C445',
  cream: '#FFF8EC',
  ink: '#2A1424',
  garden: '#4F802F',
};

export const colors = {
  // Burnt orange ramp; 500 is the brand colour.
  primary: {
    50: '#FFF4EA',
    100: '#FFE5CC',
    200: '#FDC897',
    300: '#F9A862',
    400: '#F48A38',
    500: '#EB6A1C',
    600: '#CC5512',
    700: '#A6430F',
    800: '#7E340F',
    900: '#57250C',
  },

  // Light mode uses a deeper orange for anything interactive or textual so it
  // clears WCAG AA 4.5:1 on cream (and white text on orange buttons does too).
  // The brand burnt orange (#EB6A1C) stays in the logo and in dark mode.
  primaryLight: {
    50: '#FFF4EA',
    100: '#FFE5CC',
    200: '#FDC897',
    300: '#F9A862',
    400: '#CC5512',
    500: '#A9420D',
    600: '#93390B',
    700: '#7E300A',
    800: '#632709',
    900: '#461C07',
  },

  // Tomato ramp
  secondary: {
    50: '#FFF1EF',
    100: '#FFDCD7',
    200: '#FDB5AC',
    300: '#F7867A',
    400: '#EE5548',
    500: '#E2261F',
    600: '#C01A15',
    700: '#981512',
    800: '#701211',
    900: '#4A0D0C',
  },

  accent: {
    green: '#4F802F',
    yellow: '#F6C445',
    red: '#E2261F',
    purple: '#8B5CF6',
  },

  // Warm greys tinted toward the ink so neutrals sit with the cream.
  gray: {
    50: '#FAF7F2',
    100: '#F3EEE6',
    200: '#E7DFD3',
    300: '#D3C8BA',
    400: '#A99C92',
    500: '#7D6F6C',
    600: '#5E5054',
    700: '#45363D',
    800: '#31232B',
    900: '#21141C',
  },

  // Both schemes share one structure: a warm base, a single elevated surface,
  // and 1px hairline borders instead of heavy shadows.
  light: {
    background: '#FBF6EE',
    surface: '#FFFFFF',
    surfaceElevated: '#FFFFFF',
    surfaceMuted: '#F4EDE2',
    surfaceGlass: 'rgba(251, 246, 238, 0.92)',
    border: 'rgba(42, 20, 36, 0.12)',
    borderSoft: 'rgba(42, 20, 36, 0.07)',
    overlay: 'rgba(20, 16, 18, 0.45)',
    glow: 'rgba(235, 106, 28, 0.3)',
    text: {
      primary: '#2A1424',
      secondary: '#5F4D57',
      tertiary: '#73646A',
    },
    success: '#4F802F',
    warning: '#C98A0B',
    error: '#D3221B',
    info: '#2F7FA8',
  },

  dark: {
    background: '#141012',
    surface: '#1E1A1C',
    surfaceElevated: '#1E1A1C',
    surfaceMuted: '#191517',
    surfaceGlass: 'rgba(20, 16, 18, 0.92)',
    border: 'rgba(255, 244, 227, 0.12)',
    borderSoft: 'rgba(255, 244, 227, 0.07)',
    overlay: 'rgba(0, 0, 0, 0.6)',
    glow: 'rgba(235, 106, 28, 0.35)',
    text: {
      primary: '#FFF4E3',
      secondary: '#DDCFC4',
      tertiary: '#A8988F',
    },
    success: '#7DB356',
    warning: '#F6C445',
    error: '#FF5A4E',
    info: '#7CC3E3',
  },
};

export const typography = {
  // Inter for every piece of UI text (applied by default in
  // `platform/rn-shim/ScaledText`); Fredoka only for headings and brand moments.
  fonts: {
    regular: UI_FONTS.regular,
    medium: UI_FONTS.medium,
    semibold: UI_FONTS.semibold,
    bold: UI_FONTS.bold,
    display: 'Fredoka_700Bold',
    displayMedium: 'Fredoka_600SemiBold',
  },
  textScales: TEXT_SCALES,

  sizes: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
    '4xl': 36,
    '5xl': 48,
  },

  lineHeights: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
};

// 8pt grid; `xs` is the only half step.
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
  '3xl': 64,
  gutter: 16,
};

// Radius scale is 12 / 16 / 24 (plus pills).
export const borderRadius = {
  sm: 12,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 24,
  card: 16,
  sheet: 24,
  pill: 9999,
  full: 9999,
};

export const minTapTarget = 44;

const shadowBase = (color, offsetY, opacity, radius, elevation) => ({
  shadowColor: color,
  shadowOffset: { width: 0, height: offsetY },
  shadowOpacity: opacity,
  shadowRadius: radius,
  elevation,
});

export const shadows = {
  none: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  // Hairline borders carry the structure, so shadows stay faint.
  sm: shadowBase('#140F12', 1, 0.04, 2, 1),
  md: shadowBase('#140F12', 2, 0.06, 6, 2),
  lg: shadowBase('#140F12', 6, 0.1, 14, 6),
  xl: shadowBase('#140F12', 10, 0.14, 24, 10),
  card: {
    ...shadowBase('#140F12', 2, 0.05, 6, 2),
  },
  layered: {
    ...shadowBase('#140F12', 6, 0.08, 16, 6),
  },
  glow: {
    shadowColor: '#EB6A1C',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 14,
    elevation: 8,
  },
  tabBar: shadowBase('#140F12', 0, 0, 0, 0),
};

/**
 * Motion tokens. Every animation in the app reads these; animate only
 * transform and opacity, and skip motion when `useReducedMotion()` is true.
 * `easing.bezier` feeds `Easing.bezier(...)`; `easing.css` is the same curve
 * for CSS and the View Transitions API.
 */
export const motion = {
  duration: {
    instant: 80,
    fast: 150,
    base: 250,
    normal: 250,
    slow: 400,
    enter: 250,
  },
  easing: {
    bezier: [0.2, 0.8, 0.2, 1],
    css: 'cubic-bezier(.2,.8,.2,1)',
  },
  scale: {
    press: 0.96,
    pressHard: 0.93,
    hover: 1.02,
  },
  tilt: {
    press: 1.2,
  },
  rise: 8,
  stagger: 40,
  letterStagger: 30,
  spring: {
    base: { stiffness: 400, damping: 30, mass: 1 },
    press: { stiffness: 400, damping: 30, mass: 0.6 },
    enter: { stiffness: 400, damping: 30, mass: 1 },
    soft: { stiffness: 220, damping: 18, mass: 1 },
  },
};

export const animations = {
  duration: {
    fast: motion.duration.fast,
    normal: motion.duration.normal,
    slow: motion.duration.slow,
  },
  easing: {
    easeIn: 'ease-in',
    easeOut: 'ease-out',
    easeInOut: 'ease-in-out',
  },
  motion,
};

const webGlass = {
  backdropFilter: 'blur(18px)',
  WebkitBackdropFilter: 'blur(18px)',
};

export const getSurfaceStyle = (theme, variant = 'card') => {
  const glass = {
    backgroundColor: theme.colors.surfaceGlass,
    borderWidth: 1,
    borderColor: theme.colors.borderSoft,
    borderRadius: theme.borderRadius.card,
    ...theme.shadows.card,
    ...(theme.platform === 'web' ? webGlass : null),
  };

  if (variant === 'glass') {
    return glass;
  }
  if (variant === 'elevated') {
    return {
      backgroundColor: theme.colors.surfaceElevated,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadius.card,
      ...theme.shadows.layered,
    };
  }
  if (variant === 'muted') {
    return {
      backgroundColor: theme.colors.surfaceMuted,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: theme.borderRadius.lg,
    };
  }
  return {
    backgroundColor: theme.colors.surfaceElevated,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.card,
    ...theme.shadows.md,
  };
};

/**
 * One ramp per world, keyed by the planet ids in `galaxy/planets`. Screens read
 * theirs through `PlanetScaffold`, which hands it to the render prop as
 * `accent`, so a planet's colour never has to be passed down by hand.
 *
 * Galley carries the AmpliFood burnt orange so the food screens match the
 * brand. The other three take hues far enough apart to stay legible as small
 * glowing dots on the Bridge.
 */
export const planetAccents = {
  galley: {
    50: '#FFF4EA', 100: '#FFE5CC', 200: '#FDC897', 300: '#F9A862', 400: '#F48A38',
    500: '#EB6A1C', 600: '#CC5512', 700: '#A6430F', 800: '#7E340F', 900: '#57250C',
    glow: '#EB6A1C',
  },
  atlas: {
    50: '#FFF3F0', 100: '#FFE1DA', 200: '#FFC0B2', 300: '#FF9C86', 400: '#FF8264',
    500: '#FF6B4A', 600: '#E04A28', 700: '#B0361B', 800: '#7E2916', 900: '#4A170D',
    glow: '#FF6B4A',
  },
  lumen: {
    50: '#F5F2FF', 100: '#E9E1FF', 200: '#D3C4FF', 300: '#B9A2FA', 400: '#A187F6',
    500: '#8B6BF2', 600: '#6E4BD8', 700: '#5638AC', 800: '#3E2880', 900: '#241748',
    glow: '#8B6BF2',
  },
  observatory: {
    50: '#EFFAFF', 100: '#D8F3FF', 200: '#ADE6FF', 300: '#82D8FA', 400: '#6BD0F8',
    500: '#5AC8F5', 600: '#2FA5D6', 700: '#1E7FA8', 800: '#175C79', 900: '#0E3648',
    glow: '#5AC8F5',
  },
};

export const getAccent = (accentId) => planetAccents[accentId] || planetAccents.galley;

/**
 * A coloured bloom rather than a drop shadow: no offset, so the light reads as
 * coming from the element itself. Android ignores `shadowColor` on most views,
 * which is why the glow is always decorative and never the only thing marking
 * a control as active.
 */
export const glowFor = (color, opacity = 0.35) => ({
  shadowColor: color,
  shadowOpacity: opacity,
  shadowRadius: 18,
  shadowOffset: { width: 0, height: 0 },
});

// Helper function to get theme based on color scheme
export const getTheme = (isDark, platform, accentId = 'galley') => ({
  colors: isDark ? colors.dark : colors.light,
  brand,
  primary: isDark ? colors.primary : colors.primaryLight,
  secondary: isDark ? colors.primary : colors.primaryLight,
  accent: colors.accent,
  gray: colors.gray,
  typography,
  spacing,
  borderRadius,
  minTapTarget,
  shadows,
  animations,
  motion,
  isDark,
  platform,
  planetAccents,
  planetAccent: getAccent(accentId),
  glowFor,
});

export default {
  brand,
  colors,
  typography,
  spacing,
  borderRadius,
  shadows,
  animations,
  motion,
  planetAccents,
  getAccent,
  glowFor,
  getSurfaceStyle,
  getTheme,
};

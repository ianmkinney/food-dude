// Food Dude Design System
// Modern, layered surfaces with dark mode — brand orange stays #FF6B35

export const colors = {
  // Primary brand colors
  primary: {
    50: '#FFF5F2',
    100: '#FFE8E0',
    200: '#FFD1C1',
    300: '#FFB8A1',
    400: '#FF9F82',
    500: '#FF6B35', // Main brand color
    600: '#E65A2B',
    700: '#CC4921',
    800: '#B33817',
    900: '#99270D',
  },

  // Secondary colors
  secondary: {
    50: '#F0F9FF',
    100: '#E0F2FE',
    200: '#BAE6FD',
    300: '#7DD3FC',
    400: '#38BDF8',
    500: '#0EA5E9',
    600: '#0284C7',
    700: '#0369A1',
    800: '#075985',
    900: '#0C4A6E',
  },

  // Accent colors
  accent: {
    green: '#10B981',
    yellow: '#F59E0B',
    red: '#EF4444',
    purple: '#8B5CF6',
  },

  // Neutral colors
  gray: {
    50: '#F9FAFB',
    100: '#F3F4F6',
    200: '#E5E7EB',
    300: '#D1D5DB',
    400: '#9CA3AF',
    500: '#6B7280',
    600: '#4B5563',
    700: '#374151',
    800: '#1F2937',
    900: '#111827',
  },

  // Semantic colors (light mode)
  light: {
    background: '#F4F0EB',
    surface: '#FFFDFB',
    surfaceElevated: '#FFFFFF',
    surfaceMuted: '#EDE7E0',
    surfaceGlass: 'rgba(255, 253, 251, 0.78)',
    border: '#E8DFD6',
    borderSoft: 'rgba(255, 255, 255, 0.7)',
    overlay: 'rgba(28, 18, 12, 0.45)',
    glow: 'rgba(255, 107, 53, 0.35)',
    text: {
      primary: '#111827',
      secondary: '#6B7280',
      tertiary: '#9CA3AF',
    },
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#0EA5E9',
  },

  // Semantic colors (dark mode)
  dark: {
    background: '#0B0F14',
    surface: '#141A24',
    surfaceElevated: '#1C2433',
    surfaceMuted: '#10151E',
    surfaceGlass: 'rgba(28, 36, 51, 0.72)',
    border: '#2A3344',
    borderSoft: 'rgba(255, 255, 255, 0.08)',
    overlay: 'rgba(0, 0, 0, 0.55)',
    glow: 'rgba(255, 107, 53, 0.4)',
    text: {
      primary: '#F9FAFB',
      secondary: '#D1D5DB',
      tertiary: '#9CA3AF',
    },
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#38BDF8',
  },
};

export const typography = {
  fonts: {
    regular: 'System',
    medium: 'System',
    semibold: 'System',
    bold: 'System',
  },

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

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
  '3xl': 64,
  gutter: 20,
};

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 28,
  card: 18,
  sheet: 28,
  pill: 9999,
  full: 9999,
};

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
  sm: shadowBase('#1C120C', 1, 0.06, 3, 2),
  md: shadowBase('#1C120C', 4, 0.1, 10, 5),
  lg: shadowBase('#1C120C', 8, 0.14, 18, 10),
  xl: shadowBase('#1C120C', 14, 0.18, 28, 16),
  card: {
    ...shadowBase('#1C120C', 6, 0.1, 14, 6),
  },
  layered: {
    ...shadowBase('#1C120C', 10, 0.12, 22, 12),
  },
  glow: {
    shadowColor: '#FF6B35',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.38,
    shadowRadius: 16,
    elevation: 10,
  },
  tabBar: {
    ...shadowBase('#1C120C', -4, 0.08, 16, 12),
  },
};

// Shared motion language — consume with Reanimated, not `motion`
export const motion = {
  duration: {
    instant: 80,
    fast: 150,
    normal: 250,
    slow: 400,
    enter: 320,
  },
  scale: {
    press: 0.97,
    pressHard: 0.93,
    hover: 1.02,
  },
  tilt: {
    press: 1.2,
  },
  stagger: 42,
  spring: {
    press: { damping: 18, stiffness: 320, mass: 0.35 },
    enter: { damping: 20, stiffness: 180, mass: 0.6 },
    soft: { damping: 22, stiffness: 140, mass: 0.7 },
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
 * Galley keeps Food Dude's amber at 500 so the food screens look untouched by
 * the rebrand. The other three take hues far enough apart to stay legible as
 * small glowing dots on the Bridge.
 */
export const planetAccents = {
  galley: {
    50: '#FFF8ED', 100: '#FFEFD4', 200: '#FFDCA5', 300: '#FCC46E', 400: '#F9AE42',
    500: '#F5A623', 600: '#D2860F', 700: '#A5650C', 800: '#7A4A12', 900: '#4A2C0B',
    glow: '#F5A623',
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
  primary: colors.primary,
  secondary: colors.secondary,
  accent: colors.accent,
  gray: colors.gray,
  typography,
  spacing,
  borderRadius,
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

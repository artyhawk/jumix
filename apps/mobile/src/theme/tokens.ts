/**
 * Design tokens для mobile — зеркало web design-system.md §8.
 *
 * Dark theme primary (matches web). Multi-layer backgrounds, brand orange
 * используется ТОЛЬКО для primary actions + active states (≤ 5% surface
 * area rule). Semantic colors (success/danger/warning) — status states,
 * никогда не brand.
 *
 * Единицы — dp (density-independent pixels). React Native StyleSheet
 * применяет числа как dp автоматически.
 */

export const colors = {
  // Layers — иерархия background'ов (тёмный снизу, светлый сверху)
  layer0: '#0A0A0B',
  layer1: '#111113',
  layer2: '#18181B',
  layer3: '#27272A',
  layer4: '#3F3F46',

  // Brand — orange (акценты)
  brand500: '#F97B10',
  brand400: '#FB923C',
  brand600: '#EA580C',

  // Text
  textPrimary: '#FAFAFA',
  textSecondary: '#A1A1AA',
  textTertiary: '#71717A',
  textInverse: '#0A0A0B',

  // Semantic
  success: '#22C55E',
  danger: '#EF4444',
  warning: '#EAB308',

  // Borders
  borderDefault: '#27272A',
  borderSubtle: '#1F1F22',
  borderStrong: '#3F3F46',

  // Transparency helpers
  overlayDark: 'rgba(0, 0, 0, 0.6)',
  overlayLight: 'rgba(250, 250, 250, 0.1)',
} as const

export type ColorToken = keyof typeof colors

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const

export type SpacingToken = keyof typeof spacing

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  full: 9999,
} as const

export type RadiusToken = keyof typeof radius

export const font = {
  size: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 24,
    xxl: 32,
  },
  /**
   * React Native требует fontWeight как строку. Используем точные string
   * literals (не number) чтобы избежать implicit coercion-bugs на Android.
   */
  weight: {
    regular: '400' as const,
    medium: '500' as const,
    semibold: '600' as const,
    bold: '700' as const,
  },
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
} as const

/**
 * Touch target минимум (Apple HIG + Material). Используется в Button
 * sizes, Pressable wrappers — гарантирует а11y-compliant tap area.
 */
export const touchTarget = {
  min: 44,
} as const

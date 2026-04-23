import { StyleSheet } from 'react-native'
import { colors, font } from './tokens'

/**
 * Typography presets — pre-baked StyleSheet для reuse. Импортируется
 * компонентами через `typography.heading1` etc.
 *
 * Mirror web design-system.md §4 sizing scale. Mobile slightly larger
 * default body (16 vs 14 в web) — лучше читаемость на маленьком экране.
 */
export const typography = StyleSheet.create({
  heading1: {
    fontSize: font.size.xxl,
    fontWeight: font.weight.bold,
    color: colors.textPrimary,
    lineHeight: font.size.xxl * font.lineHeight.tight,
  },
  heading2: {
    fontSize: font.size.xl,
    fontWeight: font.weight.semibold,
    color: colors.textPrimary,
    lineHeight: font.size.xl * font.lineHeight.tight,
  },
  heading3: {
    fontSize: font.size.lg,
    fontWeight: font.weight.semibold,
    color: colors.textPrimary,
    lineHeight: font.size.lg * font.lineHeight.tight,
  },
  body: {
    fontSize: font.size.base,
    fontWeight: font.weight.regular,
    color: colors.textPrimary,
    lineHeight: font.size.base * font.lineHeight.normal,
  },
  bodySecondary: {
    fontSize: font.size.base,
    fontWeight: font.weight.regular,
    color: colors.textSecondary,
    lineHeight: font.size.base * font.lineHeight.normal,
  },
  caption: {
    fontSize: font.size.sm,
    fontWeight: font.weight.regular,
    color: colors.textSecondary,
    lineHeight: font.size.sm * font.lineHeight.normal,
  },
  overline: {
    fontSize: font.size.xs,
    fontWeight: font.weight.medium,
    color: colors.textTertiary,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  mono: {
    fontSize: font.size.base,
    fontFamily: 'monospace',
    color: colors.textPrimary,
  },
})

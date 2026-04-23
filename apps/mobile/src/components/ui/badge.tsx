import { colors, font, radius, spacing } from '@/theme/tokens'
import { StyleSheet, Text, View } from 'react-native'

export type BadgeVariant =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'active'
  | 'blocked'
  | 'terminated'
  | 'expired'
  | 'expiring'
  | 'valid'
  | 'neutral'

interface BadgeProps {
  variant: BadgeVariant
  label: string
}

/**
 * Semantic pill badge. Variants map в tone-palette — **никогда не brand**
 * (оранжевый badge был бы визуальным шумом для status'а).
 *
 * success tokens: approved / active / valid
 * warning tokens: pending / blocked / expiring
 * danger tokens: rejected / terminated / expired
 * neutral tokens: fallback
 */
export function Badge({ variant, label }: BadgeProps) {
  const style = VARIANT_STYLES[variant]
  return (
    <View style={[styles.base, { backgroundColor: style.bg, borderColor: style.border }]}>
      <Text style={[styles.label, { color: style.text }]}>{label}</Text>
    </View>
  )
}

const TONE_PALETTE = {
  success: {
    bg: 'rgba(34, 197, 94, 0.12)',
    border: 'rgba(34, 197, 94, 0.35)',
    text: colors.success,
  },
  warning: {
    bg: 'rgba(234, 179, 8, 0.12)',
    border: 'rgba(234, 179, 8, 0.35)',
    text: colors.warning,
  },
  danger: {
    bg: 'rgba(239, 68, 68, 0.12)',
    border: 'rgba(239, 68, 68, 0.35)',
    text: colors.danger,
  },
  neutral: {
    bg: colors.layer3,
    border: colors.borderDefault,
    text: colors.textSecondary,
  },
} as const

const VARIANT_STYLES: Record<BadgeVariant, (typeof TONE_PALETTE)[keyof typeof TONE_PALETTE]> = {
  approved: TONE_PALETTE.success,
  active: TONE_PALETTE.success,
  valid: TONE_PALETTE.success,
  pending: TONE_PALETTE.warning,
  blocked: TONE_PALETTE.warning,
  expiring: TONE_PALETTE.warning,
  rejected: TONE_PALETTE.danger,
  terminated: TONE_PALETTE.danger,
  expired: TONE_PALETTE.danger,
  neutral: TONE_PALETTE.neutral,
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: font.size.xs,
    fontWeight: font.weight.medium,
  },
})

import { Card } from '@/components/ui/card'
import { formatExpiryCountdown } from '@/lib/format/date'
import { colors, font, spacing } from '@/theme/tokens'
import { typography } from '@/theme/typography'
import type { LicenseStatus } from '@jumix/shared'
import { StyleSheet, Text, View } from 'react-native'

interface Props {
  status: LicenseStatus
  expiresAt: string | null
}

/**
 * Conditional warning banner. Shown только когда license требует action:
 *   - `expired` → danger tone, «Удостоверение просрочено»
 *   - `expiring_critical` / `expiring_soon` → warning tone, countdown
 *   - valid/missing → null (missing имеет свой EmptyState на LicenseCurrentCard)
 */
export function LicenseWarningBanner({ status, expiresAt }: Props) {
  if (status === 'valid' || status === 'missing') return null

  const countdown = formatExpiryCountdown(expiresAt)
  const tone = status === 'expired' ? 'danger' : 'warning'
  const title = status === 'expired' ? 'Удостоверение просрочено' : 'Удостоверение скоро истечёт'
  const iconColor = tone === 'danger' ? colors.danger : colors.warning

  return (
    <Card tone={tone}>
      <View style={styles.row}>
        <Text style={[styles.icon, { color: iconColor }]}>⚠</Text>
        <View style={styles.body}>
          <Text style={[typography.body, styles.title]}>{title}</Text>
          <Text style={typography.caption}>{countdown.text}</Text>
        </View>
      </View>
    </Card>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  icon: {
    fontSize: font.size.xl,
    lineHeight: font.size.xl,
  },
  body: {
    flex: 1,
    gap: spacing.xs,
  },
  title: {
    fontWeight: font.weight.semibold,
  },
})

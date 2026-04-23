import { Badge, type BadgeVariant } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { formatDate, formatExpiryCountdown } from '@/lib/format/date'
import { LICENSE_STATUS_LABELS } from '@/lib/format/labels'
import { colors, font, spacing } from '@/theme/tokens'
import { typography } from '@/theme/typography'
import type { CraneProfile, LicenseStatus } from '@jumix/shared'
import { Pressable, StyleSheet, Text, View } from 'react-native'

interface Props {
  profile: CraneProfile
  licenseStatus: LicenseStatus
  onManagePress?: () => void
}

const LICENSE_BADGE_VARIANT: Record<LicenseStatus, BadgeVariant> = {
  missing: 'expired',
  valid: 'valid',
  expiring_soon: 'expiring',
  expiring_critical: 'expiring',
  expired: 'expired',
}

const COUNTDOWN_COLOR_BY_TONE = {
  ok: colors.textSecondary,
  warning: colors.warning,
  danger: colors.danger,
  neutral: colors.textTertiary,
} as const

/**
 * License card на /me (M2). Quick-glance: badge + expiry countdown +
 * CTA на dedicated license screen. Полный upload-flow живёт в license
 * tab (M3 — presigned PUT + camera/gallery picker).
 */
export function MeLicenseCard({ profile, licenseStatus, onManagePress }: Props) {
  const countdown = formatExpiryCountdown(profile.licenseExpiresAt)
  const hasLicense = licenseStatus !== 'missing' && profile.licenseExpiresAt !== null

  return (
    <Card>
      <View style={styles.header}>
        <Text style={[typography.overline]}>Удостоверение</Text>
        <Badge
          variant={LICENSE_BADGE_VARIANT[licenseStatus]}
          label={LICENSE_STATUS_LABELS[licenseStatus]}
        />
      </View>

      {hasLicense && profile.licenseExpiresAt ? (
        <View style={styles.body}>
          <Text style={typography.body}>
            Действует до{' '}
            <Text style={styles.dateValue}>{formatDate(profile.licenseExpiresAt)}</Text>
          </Text>
          <Text style={[typography.caption, { color: COUNTDOWN_COLOR_BY_TONE[countdown.tone] }]}>
            {countdown.text}
          </Text>
        </View>
      ) : (
        <Text style={[typography.bodySecondary, styles.body]}>Удостоверение не загружено</Text>
      )}

      {onManagePress ? (
        <Pressable
          accessibilityRole="button"
          onPress={onManagePress}
          style={({ pressed }) => [styles.manageRow, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.manageLink}>
            {hasLicense ? 'Управление удостоверением →' : 'Загрузить удостоверение →'}
          </Text>
        </Pressable>
      ) : null}
    </Card>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  body: {
    gap: spacing.xs,
  },
  dateValue: {
    color: colors.textPrimary,
    fontWeight: font.weight.semibold,
  },
  manageRow: {
    marginTop: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  manageLink: {
    color: colors.brand400,
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold,
  },
})

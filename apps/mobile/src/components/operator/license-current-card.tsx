import { Badge, type BadgeVariant } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { formatDate, formatExpiryCountdown } from '@/lib/format/date'
import { LICENSE_STATUS_LABELS } from '@/lib/format/labels'
import { colors, font, radius, spacing } from '@/theme/tokens'
import { typography } from '@/theme/typography'
import type { LicenseStatus } from '@jumix/shared'
import { Image, StyleSheet, Text, View } from 'react-native'

interface Props {
  licenseStatus: LicenseStatus
  licenseVersion: number | null
  licenseExpiresAt: string | null
  licenseUrl: string | null
  onUploadPress: () => void
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
 * Current license state card на main /license screen.
 * Missing → full EmptyState с primary CTA.
 * Present → thumbnail (image) / PDF icon + metadata + «Обновить» button.
 */
export function LicenseCurrentCard({
  licenseStatus,
  licenseVersion,
  licenseExpiresAt,
  licenseUrl,
  onUploadPress,
}: Props) {
  if (licenseStatus === 'missing') {
    return (
      <Card>
        <EmptyState
          icon={
            <View style={styles.missingIcon}>
              <Text style={styles.missingGlyph}>🪪</Text>
            </View>
          }
          title="Удостоверение не загружено"
          description="Загрузите удостоверение, чтобы получить доступ к работе. После одобрения профиля оно будет проверяться автоматически."
          action={{ label: 'Загрузить удостоверение', onPress: onUploadPress }}
        />
      </Card>
    )
  }

  const countdown = formatExpiryCountdown(licenseExpiresAt)
  const isImage = licenseUrl && /\.(jpe?g|png|webp)(\?|$)/i.test(licenseUrl)

  return (
    <Card>
      <View style={styles.header}>
        <View style={styles.thumb}>
          {isImage && licenseUrl ? (
            <Image
              source={{ uri: licenseUrl }}
              style={styles.image}
              resizeMode="cover"
              accessibilityLabel="Удостоверение"
            />
          ) : (
            <View style={styles.pdfPlaceholder}>
              <Text style={styles.pdfGlyph}>PDF</Text>
            </View>
          )}
        </View>

        <View style={styles.meta}>
          <Badge
            variant={LICENSE_BADGE_VARIANT[licenseStatus]}
            label={LICENSE_STATUS_LABELS[licenseStatus]}
          />
          {licenseVersion !== null ? (
            <Text style={[typography.caption, styles.version]}>Версия: v{licenseVersion}</Text>
          ) : null}
        </View>
      </View>

      {licenseExpiresAt ? (
        <View style={styles.expiry}>
          <Text style={typography.bodySecondary}>
            Действует до <Text style={styles.dateValue}>{formatDate(licenseExpiresAt)}</Text>
          </Text>
          <Text style={[typography.caption, { color: COUNTDOWN_COLOR_BY_TONE[countdown.tone] }]}>
            {countdown.text}
          </Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        <Button variant="secondary" onPress={onUploadPress} fullWidth>
          Обновить
        </Button>
      </View>
    </Card>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.layer3,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  image: {
    width: '100%',
    height: '100%',
  },
  pdfPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pdfGlyph: {
    color: colors.textSecondary,
    fontSize: font.size.base,
    fontWeight: font.weight.bold,
    letterSpacing: 1,
  },
  meta: {
    flex: 1,
    gap: spacing.xs,
  },
  version: {
    color: colors.textTertiary,
  },
  expiry: {
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  dateValue: {
    color: colors.textPrimary,
    fontWeight: font.weight.semibold,
  },
  actions: {
    marginTop: spacing.lg,
  },
  missingIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.layer2,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  missingGlyph: {
    fontSize: 28,
  },
})

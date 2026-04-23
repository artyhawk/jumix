import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { APPROVAL_STATUS_LABELS_PROFILE } from '@/lib/format/labels'
import { formatIin, formatPhone, getFullName, getInitials } from '@/lib/format/personal'
import { colors, spacing } from '@/theme/tokens'
import { typography } from '@/theme/typography'
import type { CraneProfile } from '@jumix/shared'
import { StyleSheet, Text, View } from 'react-native'

interface Props {
  profile: CraneProfile
}

const APPROVAL_BADGE_VARIANT = {
  pending: 'pending' as const,
  approved: 'approved' as const,
  rejected: 'rejected' as const,
}

/**
 * Identity card на /me (M2). Read-only для MVP — edit identity требует
 * re-approval flow (backlog). Rejection reason прямо в карточке если
 * profile.approvalStatus='rejected' — пользователь видит что исправлять.
 */
export function MeIdentityCard({ profile }: Props) {
  const fullName = getFullName(profile)
  const initials = getInitials(profile)
  return (
    <Card>
      <View style={styles.header}>
        <Avatar url={profile.avatarUrl} initials={initials} size={64} label={fullName} />
        <View style={styles.nameBlock}>
          <Text style={typography.heading3} numberOfLines={2}>
            {fullName}
          </Text>
          <View style={styles.badgeWrap}>
            <Badge
              variant={APPROVAL_BADGE_VARIANT[profile.approvalStatus]}
              label={APPROVAL_STATUS_LABELS_PROFILE[profile.approvalStatus]}
            />
          </View>
        </View>
      </View>

      <View style={styles.details}>
        <DetailRow label="ИИН" value={formatIin(profile.iin)} mono />
        <DetailRow label="Телефон" value={formatPhone(profile.phone)} mono />
      </View>

      {profile.approvalStatus === 'rejected' && profile.rejectionReason ? (
        <View style={styles.rejectionBox}>
          <Text style={[typography.caption, styles.rejectionTitle]}>Причина отклонения</Text>
          <Text style={[typography.bodySecondary, styles.rejectionText]}>
            {profile.rejectionReason}
          </Text>
        </View>
      ) : null}
    </Card>
  )
}

function DetailRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.detailRow}>
      <Text style={[typography.caption, styles.detailLabel]}>{label}</Text>
      <Text
        style={[typography.body, styles.detailValue, mono ? { fontFamily: 'monospace' } : null]}
      >
        {value}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  nameBlock: {
    flex: 1,
    gap: spacing.xs,
  },
  badgeWrap: {
    marginTop: spacing.xs,
    flexDirection: 'row',
  },
  details: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderSubtle,
  },
  detailLabel: {
    color: colors.textTertiary,
  },
  detailValue: {
    textAlign: 'right',
  },
  rejectionBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: 10,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    gap: spacing.xs,
  },
  rejectionTitle: {
    color: colors.danger,
  },
  rejectionText: {
    color: colors.textSecondary,
  },
})

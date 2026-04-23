import { Badge, type BadgeVariant } from '@/components/ui/badge'
import { formatDate } from '@/lib/format/date'
import { APPROVAL_STATUS_LABELS, HIRE_STATUS_LABELS } from '@/lib/format/labels'
import { colors, font, radius, spacing } from '@/theme/tokens'
import { typography } from '@/theme/typography'
import type { ApprovalStatus, MeStatusMembership, OperatorHireStatus } from '@jumix/shared'
import { Pressable, StyleSheet, Text, View } from 'react-native'

interface Props {
  membership: MeStatusMembership
  onPress?: () => void
  /** Compact — для /me summary (skip rejection details + tighter padding). */
  compact?: boolean
}

const APPROVAL_VARIANT: Record<ApprovalStatus, BadgeVariant> = {
  pending: 'pending',
  approved: 'approved',
  rejected: 'rejected',
}

const HIRE_VARIANT: Record<OperatorHireStatus, BadgeVariant> = {
  active: 'active',
  blocked: 'blocked',
  terminated: 'terminated',
}

/**
 * Row/card для одного membership. Used в:
 *  - /me MeMembershipsSummary (compact=true, first 3)
 *  - /memberships list (compact=false, full details)
 *
 * Clickable когда `onPress` задан — рендерится как Pressable; иначе View.
 * Rejection reason surfaced inline (не compact) — operator видит почему
 * отклонили без extra tap.
 */
export function MembershipRow({ membership, onPress, compact }: Props) {
  const showOperationalStatus = membership.approvalStatus === 'approved'
  const content = (
    <View style={[styles.row, compact && styles.rowCompact]}>
      <View style={styles.iconBadge}>
        <Text style={styles.iconGlyph}>🏢</Text>
      </View>
      <View style={styles.body}>
        <Text style={typography.body} numberOfLines={2}>
          {membership.organizationName}
        </Text>

        <View style={styles.badgeRow}>
          <Badge
            variant={APPROVAL_VARIANT[membership.approvalStatus]}
            label={APPROVAL_STATUS_LABELS[membership.approvalStatus]}
          />
          {showOperationalStatus ? (
            <Badge
              variant={HIRE_VARIANT[membership.status]}
              label={HIRE_STATUS_LABELS[membership.status]}
            />
          ) : null}
        </View>

        {membership.hiredAt ? (
          <Text style={[typography.caption, styles.meta]}>
            Принят: {formatDate(membership.hiredAt)}
            {membership.terminatedAt ? ` · Уволен: ${formatDate(membership.terminatedAt)}` : ''}
          </Text>
        ) : null}

        {!compact && membership.approvalStatus === 'rejected' && membership.rejectionReason ? (
          <Text style={[typography.caption, styles.rejection]}>
            Причина: {membership.rejectionReason}
          </Text>
        ) : null}
      </View>
    </View>
  )

  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      >
        {content}
      </Pressable>
    )
  }
  return <View style={styles.container}>{content}</View>
}

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.layer2,
    padding: spacing.md,
  },
  pressed: {
    opacity: 0.7,
    borderColor: colors.borderDefault,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  rowCompact: {
    gap: spacing.sm,
  },
  iconBadge: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.layer3,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGlyph: {
    fontSize: font.size.lg,
  },
  body: {
    flex: 1,
    gap: spacing.xs,
  },
  badgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  meta: {
    marginTop: 2,
  },
  rejection: {
    marginTop: spacing.xs,
    color: colors.danger,
  },
})

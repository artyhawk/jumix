import { MeScreenError } from '@/components/operator/me-screen-error'
import { MeScreenSkeleton } from '@/components/operator/me-screen-skeleton'
import { Badge, type BadgeVariant } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { SafeArea } from '@/components/ui/safe-area'
import { formatDate } from '@/lib/format/date'
import { APPROVAL_STATUS_LABELS, HIRE_STATUS_LABELS } from '@/lib/format/labels'
import { useMeStatus } from '@/lib/hooks/use-me'
import { colors, font, radius, spacing } from '@/theme/tokens'
import { typography } from '@/theme/typography'
import type { ApprovalStatus, MeStatusMembership, OperatorHireStatus } from '@jumix/shared'
import { useLocalSearchParams } from 'expo-router'
import { ScrollView, StyleSheet, Text, View } from 'react-native'

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
 * Membership detail — full info + timeline + rejection-reason surface.
 * Read-only для operator'а (ID передаётся через URL params).
 */
export default function MembershipDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const query = useMeStatus()

  if (query.isLoading) return <MeScreenSkeleton />
  if (query.isError || !query.data) {
    return (
      <SafeArea edges={['bottom']}>
        <MeScreenError error={query.error} onRetry={() => void query.refetch()} />
      </SafeArea>
    )
  }

  const membership = query.data.memberships.find((m) => m.id === id)
  if (!membership) {
    return (
      <SafeArea edges={['bottom']}>
        <View style={styles.notFound}>
          <Text style={typography.heading3}>Трудоустройство не найдено</Text>
          <Text style={typography.bodySecondary}>Возможно, запись удалена или изменился ID.</Text>
        </View>
      </SafeArea>
    )
  }

  return (
    <SafeArea edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        <HeroCard membership={membership} />
        <TimelineCard membership={membership} />
        {membership.approvalStatus === 'rejected' && membership.rejectionReason ? (
          <RejectionReasonCard reason={membership.rejectionReason} />
        ) : null}
      </ScrollView>
    </SafeArea>
  )
}

function HeroCard({ membership }: { membership: MeStatusMembership }) {
  return (
    <Card>
      <View style={styles.hero}>
        <View style={styles.orgIcon}>
          <Text style={styles.orgGlyph}>🏢</Text>
        </View>
        <View style={styles.heroBody}>
          <Text style={typography.heading3} numberOfLines={2}>
            {membership.organizationName}
          </Text>
          <View style={styles.badges}>
            <Badge
              variant={APPROVAL_VARIANT[membership.approvalStatus]}
              label={APPROVAL_STATUS_LABELS[membership.approvalStatus]}
            />
            {membership.approvalStatus === 'approved' ? (
              <Badge
                variant={HIRE_VARIANT[membership.status]}
                label={HIRE_STATUS_LABELS[membership.status]}
              />
            ) : null}
          </View>
        </View>
      </View>
    </Card>
  )
}

function TimelineCard({ membership }: { membership: MeStatusMembership }) {
  const events: Array<{ label: string; date: string }> = []
  if (membership.hiredAt) events.push({ label: 'Заявка подана', date: membership.hiredAt })
  if (membership.approvedAt) events.push({ label: 'Одобрено', date: membership.approvedAt })
  if (membership.rejectedAt) events.push({ label: 'Отклонено', date: membership.rejectedAt })
  if (membership.terminatedAt) events.push({ label: 'Уволен', date: membership.terminatedAt })

  if (events.length === 0) return null

  return (
    <Card>
      <Text style={[typography.overline, styles.timelineTitle]}>История</Text>
      <View style={styles.timelineList}>
        {events.map((e) => (
          <View key={`${e.label}-${e.date}`} style={styles.timelineRow}>
            <Text style={[typography.body, styles.timelineLabel]}>{e.label}</Text>
            <Text style={[typography.bodySecondary, styles.timelineDate]}>
              {formatDate(e.date)}
            </Text>
          </View>
        ))}
      </View>
    </Card>
  )
}

function RejectionReasonCard({ reason }: { reason: string }) {
  return (
    <Card tone="danger">
      <View style={styles.rejectionHeader}>
        <Text style={styles.rejectionIcon}>⚠</Text>
        <Text style={[typography.body, styles.rejectionTitle]}>Причина отклонения</Text>
      </View>
      <Text style={[typography.bodySecondary, styles.rejectionText]}>{reason}</Text>
    </Card>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  notFound: {
    flex: 1,
    padding: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  hero: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  orgIcon: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.layer3,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orgGlyph: {
    fontSize: font.size.xl,
  },
  heroBody: {
    flex: 1,
    gap: spacing.xs,
  },
  badges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  timelineTitle: {
    marginBottom: spacing.sm,
  },
  timelineList: {
    gap: spacing.sm,
  },
  timelineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timelineLabel: {
    color: colors.textPrimary,
  },
  timelineDate: {
    color: colors.textSecondary,
  },
  rejectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  rejectionIcon: {
    color: colors.danger,
    fontSize: font.size.lg,
  },
  rejectionTitle: {
    color: colors.danger,
    fontWeight: font.weight.semibold,
  },
  rejectionText: {
    color: colors.textSecondary,
  },
})

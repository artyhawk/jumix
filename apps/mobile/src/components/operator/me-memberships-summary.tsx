import { MembershipRow } from '@/components/operator/membership-row'
import { Card } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { colors, font, spacing } from '@/theme/tokens'
import { typography } from '@/theme/typography'
import { type MeStatusMembership, pluralRu } from '@jumix/shared'
import { Pressable, StyleSheet, Text, View } from 'react-native'

interface Props {
  memberships: MeStatusMembership[]
  onViewAll?: () => void
  onMembershipPress?: (m: MeStatusMembership) => void
}

const ORG_FORMS = ['организация', 'организации', 'организаций'] as const

/**
 * Memberships summary-секция на /me (M2). Первые 3 — полные rows; «Все
 * компании →» link если total > 3. Empty state — helpful hint что делать
 * (нужен owner который подаст заявку на найм).
 */
export function MeMembershipsSummary({ memberships, onViewAll, onMembershipPress }: Props) {
  const top = memberships.slice(0, 3)
  const extra = memberships.length - top.length
  const active = memberships.filter(
    (m) => m.approvalStatus === 'approved' && m.status === 'active',
  ).length

  if (memberships.length === 0) {
    return (
      <Card>
        <View style={styles.header}>
          <Text style={typography.overline}>Компании</Text>
        </View>
        <EmptyState
          title="Пока нет трудоустройств"
          description="Вам нужен владелец организации, который подаст заявку на ваш найм."
        />
      </Card>
    )
  }

  return (
    <Card>
      <View style={styles.header}>
        <Text style={typography.overline}>Компании</Text>
        <Text style={[typography.caption, styles.counter]}>
          {active} из {memberships.length} {pluralRu(memberships.length, ORG_FORMS)} активно
        </Text>
      </View>

      <View style={styles.list}>
        {top.map((m) => (
          <MembershipRow
            key={m.id}
            membership={m}
            compact
            onPress={onMembershipPress ? () => onMembershipPress(m) : undefined}
          />
        ))}
      </View>

      {extra > 0 && onViewAll ? (
        <Pressable
          accessibilityRole="button"
          onPress={onViewAll}
          style={({ pressed }) => [styles.viewAll, pressed && { opacity: 0.6 }]}
        >
          <Text style={styles.viewAllText}>Все компании ({memberships.length}) →</Text>
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
  counter: {
    flexShrink: 1,
    textAlign: 'right',
  },
  list: {
    gap: spacing.sm,
  },
  viewAll: {
    marginTop: spacing.md,
    minHeight: 44,
    justifyContent: 'center',
  },
  viewAllText: {
    color: colors.brand400,
    fontSize: font.size.sm,
    fontWeight: font.weight.semibold,
  },
})

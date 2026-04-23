import { MeScreenError } from '@/components/operator/me-screen-error'
import { MeScreenSkeleton } from '@/components/operator/me-screen-skeleton'
import { MembershipRow } from '@/components/operator/membership-row'
import { EmptyState } from '@/components/ui/empty-state'
import { SafeArea } from '@/components/ui/safe-area'
import { useMeStatus } from '@/lib/hooks/use-me'
import { colors, spacing } from '@/theme/tokens'
import type { MeStatusMembership } from '@jumix/shared'
import { router } from 'expo-router'
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native'

/**
 * Memberships list. Reuses useMeStatus (same cache — читаем уже загруженный
 * список). Pull-to-refresh триггерит refetch.
 */
export default function MembershipsListScreen() {
  const query = useMeStatus()

  if (query.isLoading) {
    return (
      <SafeArea edges={['bottom']}>
        <MeScreenSkeleton />
      </SafeArea>
    )
  }
  if (query.isError || !query.data) {
    return (
      <SafeArea edges={['bottom']}>
        <MeScreenError error={query.error} onRetry={() => void query.refetch()} />
      </SafeArea>
    )
  }

  const memberships = query.data.memberships
  if (memberships.length === 0) {
    return (
      <SafeArea edges={['bottom']}>
        <View style={styles.emptyWrap}>
          <EmptyState
            title="У вас нет трудоустройств"
            description="Вам нужен владелец организации, который подаст заявку на ваш найм. После одобрения компания появится здесь."
          />
        </View>
      </SafeArea>
    )
  }

  return (
    <SafeArea edges={['bottom']}>
      <FlatList<MeStatusMembership>
        data={memberships}
        keyExtractor={(m) => m.id}
        renderItem={({ item }) => (
          <MembershipRow
            membership={item}
            onPress={() => router.push({ pathname: '/memberships/[id]', params: { id: item.id } })}
          />
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl
            refreshing={query.isFetching && !query.isLoading}
            onRefresh={() => void query.refetch()}
            tintColor={colors.brand500}
            colors={[colors.brand500]}
          />
        }
      />
    </SafeArea>
  )
}

const styles = StyleSheet.create({
  list: {
    padding: spacing.lg,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
  },
})

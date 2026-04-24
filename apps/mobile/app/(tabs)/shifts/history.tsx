import { ShiftHistoryRow } from '@/components/shifts/shift-history-row'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { SafeArea } from '@/components/ui/safe-area'
import { useMyShiftsHistory } from '@/lib/hooks/use-shifts'
import { colors, spacing } from '@/theme/tokens'
import { typography } from '@/theme/typography'
import type { ShiftWithRelations } from '@jumix/shared'
import { router } from 'expo-router'
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native'

/**
 * История смен. InfiniteQuery через cursor pagination. Pull-to-refresh.
 */
export default function HistoryScreen() {
  const query = useMyShiftsHistory()
  const items: ShiftWithRelations[] = query.data?.pages.flatMap((p) => p.items) ?? []

  return (
    <SafeArea edges={['bottom']}>
      <FlatList
        contentContainerStyle={styles.listContent}
        data={items}
        keyExtractor={(s) => s.id}
        renderItem={({ item }) => (
          <ShiftHistoryRow shift={item} onPress={() => router.push(`/(tabs)/shifts/${item.id}`)} />
        )}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        refreshControl={
          <RefreshControl
            refreshing={query.isFetching && !query.isFetchingNextPage}
            onRefresh={() => void query.refetch()}
            tintColor={colors.brand500}
            colors={[colors.brand500]}
          />
        }
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) {
            void query.fetchNextPage()
          }
        }}
        onEndReachedThreshold={0.4}
        ListEmptyComponent={
          query.isLoading ? (
            <Text style={styles.loading}>Загружаем…</Text>
          ) : (
            <EmptyState
              title="Пока нет истории"
              description="Ваши завершённые смены будут отображаться здесь."
            />
          )
        }
        ListFooterComponent={
          query.hasNextPage && !query.isFetchingNextPage ? (
            <View style={styles.footer}>
              <Button variant="ghost" onPress={() => void query.fetchNextPage()} fullWidth>
                Загрузить ещё
              </Button>
            </View>
          ) : null
        }
      />
    </SafeArea>
  )
}

const styles = StyleSheet.create({
  listContent: {
    padding: spacing.lg,
    flexGrow: 1,
  },
  loading: {
    ...typography.caption,
    textAlign: 'center',
    paddingTop: spacing.xl,
  },
  footer: {
    paddingVertical: spacing.lg,
  },
})

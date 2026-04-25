import { IncidentRow } from '@/components/incidents/incident-row'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { SafeArea } from '@/components/ui/safe-area'
import { useMyIncidents } from '@/lib/hooks/use-incidents'
import { colors, font, spacing } from '@/theme/tokens'
import { typography } from '@/theme/typography'
import type { IncidentWithRelations } from '@jumix/shared'
import { router } from 'expo-router'
import { useMemo } from 'react'
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native'

/**
 * Operator's own incidents history (M6, ADR 0008). DESC by reportedAt
 * (cursor pagination via useMyIncidents). Tap row → detail. CTA «Сообщить»
 * → new modal.
 */
export default function IncidentsHistoryScreen() {
  const query = useMyIncidents()
  const items = useMemo<IncidentWithRelations[]>(
    () => query.data?.pages.flatMap((p) => p.items) ?? [],
    [query.data],
  )

  const handleEnd = () => {
    if (query.hasNextPage && !query.isFetchingNextPage) {
      void query.fetchNextPage()
    }
  }

  return (
    <SafeArea edges={['bottom']}>
      <View style={styles.container}>
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => (
            <IncidentRow
              incident={item}
              onPress={() =>
                router.push({
                  pathname: '/(tabs)/shifts/incidents/[id]',
                  params: { id: item.id },
                })
              }
            />
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={query.isRefetching}
              onRefresh={() => void query.refetch()}
              tintColor={colors.brand500}
            />
          }
          onEndReachedThreshold={0.4}
          onEndReached={handleEnd}
          ListEmptyComponent={
            query.isLoading ? (
              <Text style={[typography.caption, styles.loading]}>Загружаем…</Text>
            ) : query.isError ? (
              <EmptyState
                title="Не удалось загрузить"
                description="Проверьте подключение и попробуйте ещё раз."
                action={{ label: 'Повторить', onPress: () => void query.refetch() }}
              />
            ) : (
              <EmptyState
                title="Сообщений нет"
                description="Здесь появятся ваши сообщения о происшествиях и неисправностях."
              />
            )
          }
          ListFooterComponent={
            query.isFetchingNextPage ? (
              <Text style={[typography.caption, styles.loadingMore]}>Загружаем ещё…</Text>
            ) : null
          }
        />
        <View style={styles.footer}>
          <Button
            variant="primary"
            onPress={() => router.push('/(tabs)/shifts/incidents/new')}
            fullWidth
          >
            Сообщить о происшествии
          </Button>
        </View>
      </View>
    </SafeArea>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    flexGrow: 1,
  },
  loading: {
    color: colors.textTertiary,
    textAlign: 'center',
    marginTop: spacing.xl,
  },
  loadingMore: {
    color: colors.textTertiary,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    backgroundColor: colors.layer1,
  },
  empty: {
    fontSize: font.size.sm,
  },
})

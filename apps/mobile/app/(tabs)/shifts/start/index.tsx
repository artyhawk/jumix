import { CraneSelectionCard } from '@/components/shifts/crane-selection-card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { SafeArea } from '@/components/ui/safe-area'
import { useAvailableCranes } from '@/lib/hooks/use-shifts'
import { colors, font, spacing } from '@/theme/tokens'
import { typography } from '@/theme/typography'
import type { AvailableCrane } from '@jumix/shared'
import { router } from 'expo-router'
import { useMemo, useState } from 'react'
import { FlatList, StyleSheet, Text, View } from 'react-native'

/**
 * Step 1: crane selection. После выбора → push к checklist screen с
 * craneId + type (для conditional harness item).
 *
 * Старая начальная M4 версия submit'ила сразу — теперь wrap в nested
 * flow с pre-shift checklist (M6, ADR 0008).
 */
export default function CraneSelectionScreen() {
  const query = useAvailableCranes()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const grouped = useMemo(() => groupByOrg(query.data?.items ?? []), [query.data])

  const handleSubmit = () => {
    if (!selectedId) return
    const items = query.data?.items ?? []
    const crane = items.find((c) => c.id === selectedId)
    if (!crane) return
    router.push({
      pathname: '/(tabs)/shifts/start/checklist',
      params: {
        craneId: crane.id,
        craneType: crane.type,
        craneModel: crane.model,
      },
    })
  }

  if (query.isLoading) {
    return (
      <SafeArea edges={['bottom']}>
        <View style={styles.loading}>
          <Text style={typography.caption}>Загружаем краны…</Text>
        </View>
      </SafeArea>
    )
  }

  if (query.isError) {
    return (
      <SafeArea edges={['bottom']}>
        <View style={styles.loading}>
          <EmptyState
            title="Не удалось загрузить"
            description="Проверьте подключение и попробуйте ещё раз."
          />
          <Button variant="secondary" onPress={() => void query.refetch()} fullWidth>
            Повторить
          </Button>
        </View>
      </SafeArea>
    )
  }

  const items = query.data?.items ?? []

  if (items.length === 0) {
    return (
      <SafeArea edges={['bottom']}>
        <View style={styles.empty}>
          <EmptyState
            title="Нет доступных кранов"
            description="Обратитесь к владельцу организации — он должен назначить кран на объект."
          />
        </View>
      </SafeArea>
    )
  }

  return (
    <SafeArea edges={['bottom']}>
      <View style={styles.container}>
        <FlatList
          data={grouped}
          keyExtractor={(section) => section.organizationId}
          renderItem={({ item: section }) => (
            <View style={styles.section}>
              {grouped.length > 1 ? (
                <Text style={styles.sectionTitle}>{section.organizationName}</Text>
              ) : null}
              <View style={styles.list}>
                {section.cranes.map((crane) => (
                  <CraneSelectionCard
                    key={crane.id}
                    crane={crane}
                    selected={selectedId === crane.id}
                    onPress={() => setSelectedId(crane.id)}
                  />
                ))}
              </View>
            </View>
          )}
          ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
          contentContainerStyle={styles.listContent}
        />
        <View style={styles.footer}>
          <Button variant="primary" onPress={handleSubmit} disabled={!selectedId} fullWidth>
            Дальше
          </Button>
        </View>
      </View>
    </SafeArea>
  )
}

interface OrgSection {
  organizationId: string
  organizationName: string
  cranes: AvailableCrane[]
}

function groupByOrg(items: AvailableCrane[]): OrgSection[] {
  const map = new Map<string, OrgSection>()
  for (const crane of items) {
    const existing = map.get(crane.organization.id)
    if (existing) {
      existing.cranes.push(crane)
    } else {
      map.set(crane.organization.id, {
        organizationId: crane.organization.id,
        organizationName: crane.organization.name,
        cranes: [crane],
      })
    }
  }
  return Array.from(map.values())
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loading: {
    flex: 1,
    padding: spacing.lg,
    gap: spacing.md,
    justifyContent: 'center',
  },
  empty: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'center',
  },
  listContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    fontSize: font.size.sm,
    color: colors.textTertiary,
    fontWeight: font.weight.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  list: {
    gap: spacing.sm,
  },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    backgroundColor: colors.layer1,
  },
})

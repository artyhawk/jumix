import { ChecklistItemRow } from '@/components/checklist/checklist-item-row'
import { Button } from '@/components/ui/button'
import { SafeArea } from '@/components/ui/safe-area'
import { isApiError } from '@/lib/api/errors'
import { useStartShift } from '@/lib/hooks/use-shifts'
import { startTracking, stopTracking } from '@/lib/tracking/lifecycle'
import { PermissionDeniedError, showPermissionAlert } from '@/lib/tracking/permissions'
import { colors, font, spacing } from '@/theme/tokens'
import { typography } from '@/theme/typography'
import {
  CHECKLIST_ITEMS,
  type ChecklistItemKey,
  type ChecklistSubmission,
  type CraneType,
  REQUIRED_ITEMS_BY_CRANE_TYPE,
  type ShiftWithRelations,
} from '@jumix/shared'
import { router, useLocalSearchParams } from 'expo-router'
import { useMemo, useState } from 'react'
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native'

/**
 * Step 2: pre-shift checklist (M6, ADR 0008). Items зависят от
 * crane.type — `tower` показывает harness, остальные нет (mobile/crawler/
 * overhead — наземные/в кабине).
 *
 * Tap row → toggle checked. Long-press → action sheet с photo/notes
 * options (M6-b basic — без photo upload через action sheet, только
 * toggle. Photo+notes upload — ушёл в backlog enhancement, чтобы M6-b
 * слайс не разрастался.)
 *
 * На submit → POST /shifts/start atomic с checklist payload. Если
 * backend reject (CHECKLIST_INCOMPLETE) → defensive в UI, но shouldn't
 * happen потому что button disabled пока не все required.
 *
 * После success → start tracking (M5-b lifecycle) → router.dismissAll()
 * → main shifts screen.
 */
type ItemState = { checked: boolean; photoKey: string | null; notes: string | null }

const ALL_KEYS = CHECKLIST_ITEMS

function makeInitialItems(): Record<ChecklistItemKey, ItemState> {
  const result = {} as Record<ChecklistItemKey, ItemState>
  for (const key of ALL_KEYS) {
    result[key] = { checked: false, photoKey: null, notes: null }
  }
  return result
}

export default function ChecklistScreen() {
  const params = useLocalSearchParams<{
    craneId: string
    craneType: CraneType
    craneModel?: string
  }>()
  const startShift = useStartShift()
  const [items, setItems] = useState(makeInitialItems)

  const visibleKeys = useMemo<ChecklistItemKey[]>(() => {
    const required = REQUIRED_ITEMS_BY_CRANE_TYPE[params.craneType] ?? ALL_KEYS
    return [...required]
  }, [params.craneType])

  const requiredCheckedCount = visibleKeys.filter((k) => items[k]?.checked).length
  const allRequiredChecked = requiredCheckedCount === visibleKeys.length

  const handleToggle = (key: ChecklistItemKey) => {
    setItems((prev) => ({
      ...prev,
      [key]: { ...prev[key], checked: !prev[key].checked },
    }))
  }

  // Long-press handler НЕ привязан в M6-b — photo+notes per-item flow
  // в backlog. Пробрасывать undefined в ChecklistItemRow → gesture
  // отсутствует, operator не учится бесполезному жесту.

  const handleSubmit = () => {
    if (!allRequiredChecked) return

    const checklist: ChecklistSubmission = {
      items: Object.fromEntries(
        visibleKeys.map((k) => [k, items[k]]),
      ) as ChecklistSubmission['items'],
    }

    startShift.mutate(
      { craneId: params.craneId, checklist },
      {
        onSuccess: async (shift: ShiftWithRelations) => {
          // M5-b: start tracking after successful create.
          try {
            await startTracking({
              shiftId: shift.id,
              site: {
                id: shift.site.id,
                latitude: shift.site.latitude,
                longitude: shift.site.longitude,
                geofenceRadiusM: shift.site.geofenceRadiusM,
              },
            })
          } catch (err) {
            if (err instanceof PermissionDeniedError) {
              await stopTracking()
              showPermissionAlert(err.kind)
            } else {
              console.warn('startTracking failed', err)
            }
          }
          router.dismissAll()
        },
        onError: (err) => {
          const msg = isApiError(err) ? err.message : 'Попробуйте ещё раз'
          Alert.alert('Не удалось начать смену', msg)
        },
      },
    )
  }

  return (
    <SafeArea edges={['bottom']}>
      <View style={styles.container}>
        <ScrollView contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Text style={[typography.heading2, styles.headerTitle]}>Перед сменой</Text>
            <Text style={[typography.body, styles.headerSubtitle]}>
              Проверьте СИЗ и состояние крана. Без отметки всех пунктов смену начать нельзя.
            </Text>
            {params.craneModel ? <Text style={styles.headerCrane}>{params.craneModel}</Text> : null}
          </View>

          <View style={styles.list}>
            {visibleKeys.map((key) => (
              <ChecklistItemRow
                key={key}
                itemKey={key}
                checked={items[key].checked}
                hasPhoto={items[key].photoKey !== null}
                hasNotes={items[key].notes !== null}
                onToggle={() => handleToggle(key)}
              />
            ))}
          </View>
        </ScrollView>
        <View style={styles.footer}>
          <Text style={styles.progress}>
            {requiredCheckedCount}/{visibleKeys.length} проверено
          </Text>
          <Button
            variant="primary"
            onPress={handleSubmit}
            disabled={!allRequiredChecked || startShift.isPending}
            loading={startShift.isPending}
            fullWidth
          >
            Начать смену
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
  scrollContent: {
    padding: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  header: {
    gap: spacing.xs,
  },
  headerTitle: {
    color: colors.textPrimary,
    fontWeight: font.weight.semibold,
  },
  headerSubtitle: {
    color: colors.textSecondary,
  },
  headerCrane: {
    fontSize: font.size.sm,
    color: colors.textTertiary,
    fontFamily: 'monospace',
    marginTop: spacing.xs,
  },
  list: {
    gap: spacing.sm,
  },
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    backgroundColor: colors.layer1,
    gap: spacing.sm,
  },
  progress: {
    fontSize: font.size.sm,
    color: colors.textTertiary,
    textAlign: 'center',
    fontWeight: font.weight.medium,
  },
})

import { ActiveShiftCard } from '@/components/shifts/active-shift-card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { SafeArea } from '@/components/ui/safe-area'
import { isApiError } from '@/lib/api/errors'
import { useForegroundTracking } from '@/lib/hooks/use-foreground-tracking'
import { useGeofenceState } from '@/lib/hooks/use-geofence-state'
import { useMeStatus } from '@/lib/hooks/use-me'
import {
  useEndShift,
  useMyActiveShift,
  usePauseShift,
  useResumeShift,
} from '@/lib/hooks/use-shifts'
import { stopTracking } from '@/lib/tracking/lifecycle'
import { colors, spacing } from '@/theme/tokens'
import { typography } from '@/theme/typography'
import { router } from 'expo-router'
import { useCallback, useMemo } from 'react'
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native'

/**
 * Shifts main screen. Branches на useMyActiveShift:
 *   - live shift  → ActiveShiftCard (timer + pause/resume + end)
 *   - нет shift + canWork=true  → «Начать смену» CTA + history link
 *   - нет shift + canWork=false → blocking message + reasons + link к /me
 */
export default function ShiftsIndexScreen() {
  const active = useMyActiveShift()
  const me = useMeStatus()
  const pause = usePauseShift()
  const resume = useResumeShift()
  const endMutation = useEndShift()

  const shift = active.data ?? null

  // M5-b tracking. Pass site coords в hooks чтобы geofence calc'ился
  // client-side. Стоп-tracking делаем на end (ниже в handleEnd.onSuccess).
  const trackedShift = useMemo(
    () => (shift ? { id: shift.id, status: shift.status } : null),
    [shift],
  )
  const trackedSite = useMemo(
    () =>
      shift
        ? {
            latitude: shift.site.latitude,
            longitude: shift.site.longitude,
            geofenceRadiusM: shift.site.geofenceRadiusM,
          }
        : null,
    [shift],
  )
  useForegroundTracking(trackedShift, trackedSite)
  const geofence = useGeofenceState(shift?.id ?? null)

  const isMutating = pause.isPending || resume.isPending || endMutation.isPending

  const handleEnd = useCallback(
    (id: string) => {
      Alert.alert('Завершить смену?', 'Смену нельзя восстановить после завершения.', [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Завершить',
          style: 'destructive',
          onPress: () => {
            endMutation.mutate(
              { id },
              {
                onSuccess: () => {
                  // Остановить background tracking + clear SQLite context.
                  void stopTracking()
                },
                onError: (err) => {
                  const msg = isApiError(err) ? err.message : 'Попробуйте ещё раз'
                  Alert.alert('Не удалось завершить', msg)
                },
              },
            )
          },
        },
      ])
    },
    [endMutation],
  )

  const onRefresh = useCallback(() => {
    void active.refetch()
    void me.refetch()
  }, [active, me])

  return (
    <SafeArea edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={styles.container}
        refreshControl={
          <RefreshControl
            refreshing={active.isFetching && !active.isLoading}
            onRefresh={onRefresh}
            tintColor={colors.brand500}
            colors={[colors.brand500]}
          />
        }
      >
        <View style={styles.header}>
          <Text style={typography.caption}>Ваш день</Text>
          <Text style={typography.heading2}>Смены</Text>
        </View>

        {shift ? (
          <ActiveShiftCard
            shift={shift}
            onPause={() => pause.mutate(shift.id)}
            onResume={() => resume.mutate(shift.id)}
            onEnd={() => handleEnd(shift.id)}
            isPending={isMutating}
            geofenceState={geofence.state}
            lastPingAgeMs={geofence.lastPingAgeMs}
          />
        ) : me.data && !me.data.canWork ? (
          <View style={styles.blockCard}>
            <EmptyState
              title="Нельзя начать смену"
              description="Проверьте статус профиля и документов."
            />
            {me.data.canWorkReasons.length > 0 ? (
              <View style={styles.reasons}>
                {me.data.canWorkReasons.map((reason) => (
                  <Text key={reason} style={styles.reasonItem}>
                    • {reason}
                  </Text>
                ))}
              </View>
            ) : null}
            <Button variant="secondary" onPress={() => router.push('/(tabs)/me')} fullWidth>
              К профилю
            </Button>
          </View>
        ) : (
          <View style={styles.startCard}>
            <Text style={typography.heading3}>Готовы начать смену?</Text>
            <Text style={typography.caption}>Выберите кран из доступных на вашем объекте.</Text>
            <Button variant="primary" onPress={() => router.push('/(tabs)/shifts/start')} fullWidth>
              Начать смену
            </Button>
          </View>
        )}

        <View style={styles.linkGroup}>
          <Button variant="ghost" onPress={() => router.push('/(tabs)/shifts/history')} fullWidth>
            История смен
          </Button>
          <Button variant="ghost" onPress={() => router.push('/(tabs)/shifts/incidents')} fullWidth>
            Происшествия и неисправности
          </Button>
        </View>
      </ScrollView>
    </SafeArea>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  header: {
    gap: 2,
  },
  startCard: {
    padding: spacing.lg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.layer1,
    gap: spacing.md,
  },
  blockCard: {
    padding: spacing.lg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.layer1,
    gap: spacing.md,
  },
  reasons: {
    gap: 4,
  },
  linkGroup: {
    gap: spacing.xs,
  },
  reasonItem: {
    color: colors.textSecondary,
    fontSize: 14,
  },
})

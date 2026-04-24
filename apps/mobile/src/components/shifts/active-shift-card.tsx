import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatDuration, formatTime } from '@/lib/format/duration'
import { useShiftTimer } from '@/lib/hooks/use-shift-timer'
import type { GeofenceState } from '@/lib/tracking/geofence'
import { colors, font, spacing } from '@/theme/tokens'
import { typography } from '@/theme/typography'
import type { ShiftWithRelations } from '@jumix/shared'
import { StyleSheet, Text, View } from 'react-native'

interface Props {
  shift: ShiftWithRelations
  onPause: () => void
  onResume: () => void
  onEnd: () => void
  isPending?: boolean
  /**
   * M5-b: computed геозона state. 'inside' → compact badge, 'outside' →
   * warning banner, 'unknown' → nothing (не показываем до первого
   * стабильного sample'а).
   */
  geofenceState?: GeofenceState
  /**
   * Age последнего GPS ping в ms. Если > 2 минут — показываем stale-GPS
   * warning под timer'ом.
   */
  lastPingAgeMs?: number | null
}

const STALE_PING_THRESHOLD_MS = 120_000

/**
 * Hero card на главном экране смен. Показывает live timer + crane + site
 * + actions (pause/resume + end). Tone — success для active, warning для
 * paused. Semantic colors — не brand (смысловой indicator, не accent).
 */
export function ActiveShiftCard({
  shift,
  onPause,
  onResume,
  onEnd,
  isPending,
  geofenceState,
  lastPingAgeMs,
}: Props) {
  const elapsed = useShiftTimer(shift)
  const isPaused = shift.status === 'paused'
  const isStale =
    lastPingAgeMs !== null && lastPingAgeMs !== undefined && lastPingAgeMs > STALE_PING_THRESHOLD_MS

  return (
    <Card tone={isPaused ? 'warning' : 'success'}>
      <View style={styles.header}>
        <Text style={typography.overline}>
          {isPaused ? 'Смена приостановлена' : 'Смена активна'}
        </Text>
        <Badge
          variant={isPaused ? 'expiring' : 'active'}
          label={isPaused ? 'Перерыв' : 'В работе'}
        />
      </View>

      <Text style={styles.timer}>{formatDuration(elapsed)}</Text>

      {isStale ? <Text style={styles.staleWarning}>GPS не обновлялся более 2 минут</Text> : null}

      <GeofenceSection state={geofenceState} siteName={shift.site.name} />

      <View style={styles.infoBlock}>
        <InfoRow label="Кран" value={shiftCraneLabel(shift)} />
        <InfoRow label="Объект" value={shift.site.name} />
        <InfoRow label="Начало" value={formatTime(shift.startedAt)} />
      </View>

      <View style={styles.actions}>
        {isPaused ? (
          <Button variant="primary" onPress={onResume} loading={isPending} fullWidth>
            Продолжить
          </Button>
        ) : (
          <Button variant="secondary" onPress={onPause} loading={isPending} fullWidth>
            Перерыв
          </Button>
        )}
        <Button variant="danger" onPress={onEnd} loading={isPending} fullWidth>
          Завершить смену
        </Button>
      </View>
    </Card>
  )
}

/**
 * Geofence banner — advisory, не blocking (ADR 0007 §4). 'outside' =
 * danger-tone banner с инструкцией вернуться. 'inside' = compact success
 * badge. 'unknown' — ничего (не было ≥2 consecutive стабильных pings
 * ещё, или нет GPS).
 */
function GeofenceSection({ state, siteName }: { state?: GeofenceState; siteName: string }) {
  if (!state || state === 'unknown') return null
  if (state === 'inside') {
    return (
      <View style={styles.geofenceInside}>
        <Badge variant="valid" label="На объекте" />
      </View>
    )
  }
  return (
    <View style={styles.geofenceOutside}>
      <Text style={styles.outsideTitle}>Вы покинули объект</Text>
      <Text style={styles.outsideBody}>Вернитесь на «{siteName}», чтобы продолжить работу</Text>
    </View>
  )
}

function shiftCraneLabel(shift: ShiftWithRelations): string {
  const inv = shift.crane.inventoryNumber
  return inv ? `${shift.crane.model} · ${inv}` : shift.crane.model
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  timer: {
    fontSize: 48,
    fontWeight: font.weight.bold,
    color: colors.textPrimary,
    textAlign: 'center',
    paddingVertical: spacing.md,
    fontVariant: ['tabular-nums'],
  },
  staleWarning: {
    textAlign: 'center',
    fontSize: font.size.xs,
    color: colors.warning,
    marginBottom: spacing.sm,
  },
  geofenceInside: {
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  geofenceOutside: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    gap: 2,
  },
  outsideTitle: {
    fontSize: font.size.sm,
    fontWeight: font.weight.bold,
    color: colors.danger,
  },
  outsideBody: {
    fontSize: font.size.xs,
    color: colors.textSecondary,
  },
  infoBlock: {
    gap: spacing.xs,
    marginBottom: spacing.lg,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  infoLabel: {
    fontSize: font.size.sm,
    color: colors.textTertiary,
  },
  infoValue: {
    fontSize: font.size.sm,
    color: colors.textPrimary,
    fontWeight: font.weight.medium,
    flexShrink: 1,
    textAlign: 'right',
  },
  actions: {
    gap: spacing.sm,
  },
})

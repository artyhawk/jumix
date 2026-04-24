import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { formatDuration, formatTime } from '@/lib/format/duration'
import { useShiftTimer } from '@/lib/hooks/use-shift-timer'
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
}

/**
 * Hero card на главном экране смен. Показывает live timer + crane + site
 * + actions (pause/resume + end). Tone — success для active, warning для
 * paused. Semantic colors — не brand (смысловой indicator, не accent).
 */
export function ActiveShiftCard({ shift, onPause, onResume, onEnd, isPending }: Props) {
  const elapsed = useShiftTimer(shift)
  const isPaused = shift.status === 'paused'

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

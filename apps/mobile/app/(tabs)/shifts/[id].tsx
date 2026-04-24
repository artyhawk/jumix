import { computeShiftDurationSeconds } from '@/components/shifts/shift-history-row'
import { EmptyState } from '@/components/ui/empty-state'
import { SafeArea } from '@/components/ui/safe-area'
import { formatDate } from '@/lib/format/date'
import { formatDuration, formatTime } from '@/lib/format/duration'
import { useShiftDetail, useShiftPath } from '@/lib/hooks/use-shifts'
import { colors, font, radius, spacing } from '@/theme/tokens'
import { typography } from '@/theme/typography'
import type { ShiftWithRelations } from '@jumix/shared'
import { useLocalSearchParams } from 'expo-router'
import { ScrollView, StyleSheet, Text, View } from 'react-native'

/**
 * Shift detail — полные метаданные + duration breakdown + notes.
 */
export default function ShiftDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const query = useShiftDetail(id)

  if (query.isLoading) {
    return (
      <SafeArea edges={['bottom']}>
        <View style={styles.state}>
          <Text style={typography.caption}>Загружаем смену…</Text>
        </View>
      </SafeArea>
    )
  }

  if (query.isError || !query.data) {
    return (
      <SafeArea edges={['bottom']}>
        <View style={styles.state}>
          <EmptyState
            title="Смена не найдена"
            description="Возможно, она была удалена или у вас нет к ней доступа."
          />
        </View>
      </SafeArea>
    )
  }

  return (
    <SafeArea edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.container}>
        <ShiftDetailBody shift={query.data} />
      </ScrollView>
    </SafeArea>
  )
}

function ShiftDetailBody({ shift }: { shift: ShiftWithRelations }) {
  const duration = computeShiftDurationSeconds(shift)
  // Path stats — только для ended смен; ongoing refresh'ится через
  // useMyActiveShift, здесь не тратим network.
  const path = useShiftPath(shift.status === 'ended' ? shift.id : null)

  return (
    <View style={styles.content}>
      <View style={styles.header}>
        <Text style={typography.caption}>{formatDate(shift.startedAt)}</Text>
        <Text style={typography.heading2}>{shift.crane.model}</Text>
        <Text style={typography.bodySecondary}>{shift.site.name}</Text>
      </View>

      <View style={styles.block}>
        <Row label="Статус" value={STATUS_LABEL[shift.status]} />
        <Row label="Начало" value={formatTime(shift.startedAt)} />
        {shift.endedAt ? <Row label="Конец" value={formatTime(shift.endedAt)} /> : null}
        {shift.status === 'ended' ? (
          <Row label="Рабочее время" value={formatDuration(duration)} mono />
        ) : null}
        {shift.totalPauseSeconds > 0 ? (
          <Row label="Пауза" value={formatDuration(shift.totalPauseSeconds)} mono />
        ) : null}
      </View>

      {shift.status === 'ended' && path.data ? (
        <View style={styles.block}>
          <Text style={typography.overline}>Маршрут</Text>
          <Row label="GPS точек" value={String(path.data.pings.length)} mono />
          <Row label="На объекте" value={`${onSiteCount(path.data.pings)}`} mono />
          <Row label="Вне объекта" value={`${offSiteCount(path.data.pings)}`} mono />
        </View>
      ) : null}

      <View style={styles.block}>
        <Row label="Кран" value={shift.crane.model} />
        {shift.crane.inventoryNumber ? (
          <Row label="Инв. №" value={shift.crane.inventoryNumber} mono />
        ) : null}
        <Row label="Грузоподъёмность" value={`${shift.crane.capacityTon} т`} />
        <Row label="Объект" value={shift.site.name} />
        <Row label="Компания" value={shift.organization.name} />
      </View>

      {shift.notes ? (
        <View style={styles.notesBlock}>
          <Text style={typography.overline}>Заметки</Text>
          <Text style={typography.body}>{shift.notes}</Text>
        </View>
      ) : null}
    </View>
  )
}

function onSiteCount(pings: Array<{ insideGeofence: boolean | null }>): number {
  return pings.filter((p) => p.insideGeofence === true).length
}

function offSiteCount(pings: Array<{ insideGeofence: boolean | null }>): number {
  return pings.filter((p) => p.insideGeofence === false).length
}

const STATUS_LABEL: Record<ShiftWithRelations['status'], string> = {
  active: 'В работе',
  paused: 'Перерыв',
  ended: 'Завершена',
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, mono ? styles.mono : null]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  state: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'center',
  },
  content: {
    gap: spacing.lg,
  },
  header: {
    gap: 2,
  },
  block: {
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.layer1,
    gap: spacing.sm,
  },
  notesBlock: {
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.layer1,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  rowLabel: {
    fontSize: font.size.sm,
    color: colors.textTertiary,
  },
  rowValue: {
    fontSize: font.size.sm,
    color: colors.textPrimary,
    fontWeight: font.weight.medium,
    textAlign: 'right',
    flexShrink: 1,
  },
  mono: {
    fontFamily: 'monospace',
    fontVariant: ['tabular-nums'],
  },
})

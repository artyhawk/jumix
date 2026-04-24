import { formatDate } from '@/lib/format/date'
import { formatDuration } from '@/lib/format/duration'
import { colors, font, radius, spacing, touchTarget } from '@/theme/tokens'
import type { ShiftWithRelations } from '@jumix/shared'
import { Pressable, StyleSheet, Text, View } from 'react-native'

interface Props {
  shift: ShiftWithRelations
  onPress: () => void
}

/**
 * Compact row для истории смен. Duration — computed: ended ? ended-started-pauses
 * : 0 (live shifts в истории не появляются, но safety fallback).
 */
export function ShiftHistoryRow({ shift, onPress }: Props) {
  const duration = computeShiftDurationSeconds(shift)

  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.row}>
      <View style={styles.info}>
        <Text style={styles.model}>{shift.crane.model}</Text>
        <Text style={styles.site}>{shift.site.name}</Text>
        <Text style={styles.date}>{formatDate(shift.startedAt)}</Text>
      </View>
      <Text style={styles.duration}>{formatDuration(duration)}</Text>
    </Pressable>
  )
}

export function computeShiftDurationSeconds(shift: ShiftWithRelations): number {
  if (shift.status !== 'ended' || !shift.endedAt) return 0
  const startedMs = new Date(shift.startedAt).getTime()
  const endedMs = new Date(shift.endedAt).getTime()
  const raw = Math.floor((endedMs - startedMs) / 1000) - shift.totalPauseSeconds
  return Math.max(0, raw)
}

const styles = StyleSheet.create({
  row: {
    minHeight: touchTarget.min + 20,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.layer1,
    gap: spacing.md,
  },
  info: {
    gap: 2,
    flexShrink: 1,
  },
  model: {
    fontSize: font.size.base,
    fontWeight: font.weight.semibold,
    color: colors.textPrimary,
  },
  site: {
    fontSize: font.size.sm,
    color: colors.textSecondary,
  },
  date: {
    fontSize: font.size.xs,
    color: colors.textTertiary,
  },
  duration: {
    fontSize: font.size.lg,
    fontWeight: font.weight.semibold,
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
})

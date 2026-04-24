import { colors, font, radius, spacing } from '@/theme/tokens'
import { StyleSheet, Text, View } from 'react-native'

interface ProgressBarProps {
  /** Fraction 0..1 (clamp'ится в render'е). */
  value: number
  label?: string
  showPercent?: boolean
}

/**
 * Линейный progress bar для upload/download. Brand-500 fill на layer-3
 * track — единственное использование brand orange в прогрессе (активное
 * состояние, не passive element; acceptable exception от ≤5% rule).
 */
export function ProgressBar({ value, label, showPercent = true }: ProgressBarProps) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100)

  return (
    <View style={styles.container}>
      {label ? (
        <View style={styles.labelRow}>
          <Text style={styles.label}>{label}</Text>
          {showPercent ? <Text style={styles.percent}>{pct}%</Text> : null}
        </View>
      ) : null}
      <View style={styles.track} accessibilityLabel={`Прогресс ${pct} процентов`}>
        <View style={[styles.fill, { width: `${pct}%` }]} />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  labelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: font.size.sm,
    color: colors.textSecondary,
  },
  percent: {
    fontSize: font.size.sm,
    color: colors.textPrimary,
    fontWeight: font.weight.semibold,
  },
  track: {
    height: 6,
    backgroundColor: colors.layer3,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    backgroundColor: colors.brand500,
    borderRadius: radius.full,
  },
})

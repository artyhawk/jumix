import { colors, font, radius, spacing, touchTarget } from '@/theme/tokens'
import { INCIDENT_TYPE_LABELS, type IncidentType } from '@jumix/shared'
import { Pressable, StyleSheet, Text, View } from 'react-native'

interface Props {
  type: IncidentType
  selected: boolean
  onPress: () => void
}

/**
 * Radio card для выбора incident type. List in a column на форме —
 * 6 типов всего (crane_malfunction, material_fall, near_miss, minor_injury,
 * safety_violation, other). Selected — brand-border (legitimate active-state
 * indicator на mobile).
 */
export function IncidentTypeCard({ type, selected, onPress }: Props) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={INCIDENT_TYPE_LABELS[type]}
      onPress={onPress}
      style={[styles.container, selected && styles.containerSelected]}
    >
      <View style={[styles.indicator, selected && styles.indicatorSelected]}>
        {selected ? <View style={styles.indicatorDot} /> : null}
      </View>
      <Text style={[styles.label, selected && styles.labelSelected]}>
        {INCIDENT_TYPE_LABELS[type]}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    minHeight: touchTarget.min,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    backgroundColor: colors.layer1,
  },
  containerSelected: {
    borderColor: colors.brand500,
    backgroundColor: colors.layer2,
  },
  indicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  indicatorSelected: {
    borderColor: colors.brand500,
  },
  indicatorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.brand500,
  },
  label: {
    flex: 1,
    fontSize: font.size.base,
    color: colors.textPrimary,
  },
  labelSelected: {
    fontWeight: font.weight.medium,
  },
})

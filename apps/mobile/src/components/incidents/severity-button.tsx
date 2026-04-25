import { colors, font, radius, spacing, touchTarget } from '@/theme/tokens'
import { INCIDENT_SEVERITY_LABELS, type IncidentSeverity } from '@jumix/shared'
import { Pressable, StyleSheet, Text } from 'react-native'

interface Props {
  severity: IncidentSeverity
  selected: boolean
  onPress: () => void
}

const TONE_BY_SEVERITY: Record<
  IncidentSeverity,
  { selectedBg: string; selectedBorder: string; selectedText: string }
> = {
  info: {
    selectedBg: 'rgba(161, 161, 170, 0.15)',
    selectedBorder: colors.textSecondary,
    selectedText: colors.textPrimary,
  },
  warning: {
    selectedBg: 'rgba(234, 179, 8, 0.15)',
    selectedBorder: colors.warning,
    selectedText: colors.warning,
  },
  critical: {
    selectedBg: 'rgba(239, 68, 68, 0.15)',
    selectedBorder: colors.danger,
    selectedText: colors.danger,
  },
}

/**
 * Severity selector button (M6, ADR 0008). 3 buttons in a row на create
 * incident form. Selected state — tinted bg + border в соответствии с
 * tone. Unselected — neutral.
 */
export function SeverityButton({ severity, selected, onPress }: Props) {
  const tone = TONE_BY_SEVERITY[severity]
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={INCIDENT_SEVERITY_LABELS[severity]}
      onPress={onPress}
      style={[
        styles.button,
        selected ? { borderColor: tone.selectedBorder, backgroundColor: tone.selectedBg } : null,
      ]}
    >
      <Text
        style={[
          styles.label,
          selected ? { color: tone.selectedText, fontWeight: font.weight.semibold } : null,
        ]}
      >
        {INCIDENT_SEVERITY_LABELS[severity]}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  button: {
    flex: 1,
    minHeight: touchTarget.min,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    backgroundColor: colors.layer1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: font.size.sm,
    color: colors.textSecondary,
  },
})

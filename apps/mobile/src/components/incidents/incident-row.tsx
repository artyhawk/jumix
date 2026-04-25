import { Badge, type BadgeVariant } from '@/components/ui/badge'
import { formatDate } from '@/lib/format/date'
import { colors, font, radius, spacing, touchTarget } from '@/theme/tokens'
import {
  INCIDENT_SEVERITY_LABELS,
  INCIDENT_STATUS_LABELS,
  INCIDENT_TYPE_LABELS,
  type IncidentSeverity,
  type IncidentStatus,
  type IncidentType,
  type IncidentWithRelations,
} from '@jumix/shared'
import { Pressable, StyleSheet, Text, View } from 'react-native'

interface Props {
  incident: IncidentWithRelations
  onPress: () => void
}

const SEVERITY_VARIANT: Record<IncidentSeverity, BadgeVariant> = {
  info: 'neutral',
  warning: 'pending',
  critical: 'rejected',
}
const STATUS_VARIANT: Record<IncidentStatus, BadgeVariant> = {
  submitted: 'pending',
  acknowledged: 'active',
  resolved: 'approved',
  escalated: 'rejected',
}

/**
 * Compact row для operator's incident history list (M6, ADR 0008).
 * Tap → detail screen.
 */
export function IncidentRow({ incident, onPress }: Props) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.type}>{INCIDENT_TYPE_LABELS[incident.type as IncidentType]}</Text>
        <Badge
          variant={STATUS_VARIANT[incident.status as IncidentStatus]}
          label={INCIDENT_STATUS_LABELS[incident.status as IncidentStatus]}
        />
      </View>
      <Text numberOfLines={2} style={styles.description}>
        {incident.description}
      </Text>
      <View style={styles.footerRow}>
        <Badge
          variant={SEVERITY_VARIANT[incident.severity as IncidentSeverity]}
          label={INCIDENT_SEVERITY_LABELS[incident.severity as IncidentSeverity]}
        />
        <Text style={styles.date}>{formatDate(incident.reportedAt)}</Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    minHeight: touchTarget.min,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    backgroundColor: colors.layer1,
    gap: spacing.xs,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  type: {
    fontSize: font.size.base,
    color: colors.textPrimary,
    fontWeight: font.weight.semibold,
    flexShrink: 1,
  },
  description: {
    fontSize: font.size.sm,
    color: colors.textSecondary,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  date: {
    fontSize: font.size.xs,
    color: colors.textTertiary,
  },
})

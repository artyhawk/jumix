import { Badge, type BadgeVariant } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { SafeArea } from '@/components/ui/safe-area'
import { formatDate } from '@/lib/format/date'
import { useIncident } from '@/lib/hooks/use-incidents'
import { colors, font, radius, spacing } from '@/theme/tokens'
import { typography } from '@/theme/typography'
import {
  INCIDENT_SEVERITY_LABELS,
  INCIDENT_STATUS_LABELS,
  INCIDENT_TYPE_LABELS,
  type IncidentSeverity,
  type IncidentStatus,
  type IncidentType,
} from '@jumix/shared'
import { useLocalSearchParams } from 'expo-router'
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native'

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
 * Read-only detail screen для operator's own incident (M6, ADR 0008).
 * Shows status timeline (when acknowledged/resolved/escalated by owner) +
 * photos thumbnails (presigned GET URLs) + linked shift/site/crane refs.
 */
export default function IncidentDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>()
  const query = useIncident(params.id)

  if (query.isLoading) {
    return (
      <SafeArea edges={['bottom']}>
        <View style={styles.center}>
          <Text style={typography.caption}>Загружаем…</Text>
        </View>
      </SafeArea>
    )
  }
  if (query.isError || !query.data) {
    return (
      <SafeArea edges={['bottom']}>
        <View style={styles.center}>
          <EmptyState
            title="Не удалось загрузить"
            description="Проверьте подключение и попробуйте ещё раз."
            action={{ label: 'Повторить', onPress: () => void query.refetch() }}
          />
        </View>
      </SafeArea>
    )
  }

  const inc = query.data

  return (
    <SafeArea edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={[typography.heading2, styles.title]}>
            {INCIDENT_TYPE_LABELS[inc.type as IncidentType]}
          </Text>
          <View style={styles.badgesRow}>
            <Badge
              variant={SEVERITY_VARIANT[inc.severity as IncidentSeverity]}
              label={INCIDENT_SEVERITY_LABELS[inc.severity as IncidentSeverity]}
            />
            <Badge
              variant={STATUS_VARIANT[inc.status as IncidentStatus]}
              label={INCIDENT_STATUS_LABELS[inc.status as IncidentStatus]}
            />
          </View>
          <Text style={styles.timestamp}>{formatDate(inc.reportedAt)}</Text>
        </View>

        <Section label="Описание">
          <Text style={styles.description}>{inc.description}</Text>
        </Section>

        {inc.photos.length > 0 ? (
          <Section label={`Фото (${inc.photos.length})`}>
            <View style={styles.photoGrid}>
              {inc.photos.map((photo) => (
                <View key={photo.id} style={styles.photoTile}>
                  {photo.url ? (
                    <Image source={{ uri: photo.url }} style={styles.photoImage} />
                  ) : (
                    <View style={[styles.photoImage, styles.photoPlaceholder]}>
                      <Text style={styles.photoPlaceholderText}>фото</Text>
                    </View>
                  )}
                </View>
              ))}
            </View>
          </Section>
        ) : null}

        {inc.shift ? (
          <Section label="Смена">
            <Text style={styles.detail}>{formatDate(inc.shift.startedAt)}</Text>
          </Section>
        ) : null}
        {inc.site ? (
          <Section label="Объект">
            <Text style={styles.detail}>{inc.site.name}</Text>
            {inc.site.address ? <Text style={styles.detailMuted}>{inc.site.address}</Text> : null}
          </Section>
        ) : null}
        {inc.crane ? (
          <Section label="Кран">
            <Text style={styles.detail}>
              {inc.crane.model}
              {inc.crane.inventoryNumber ? ` · ${inc.crane.inventoryNumber}` : ''}
            </Text>
          </Section>
        ) : null}
        {inc.latitude !== null && inc.longitude !== null ? (
          <Section label="Координаты">
            <Text style={[styles.detail, styles.mono]}>
              {inc.latitude.toFixed(5)}, {inc.longitude.toFixed(5)}
            </Text>
          </Section>
        ) : null}

        {inc.acknowledgedAt || inc.resolvedAt ? (
          <Section label="Хронология">
            <View style={styles.timeline}>
              <TimelineItem
                dotColor={colors.textTertiary}
                text={`Отправлено · ${formatDate(inc.reportedAt)}`}
              />
              {inc.acknowledgedAt ? (
                <TimelineItem
                  dotColor={colors.success}
                  text={`Принято · ${formatDate(inc.acknowledgedAt)}`}
                />
              ) : null}
              {inc.resolvedAt ? (
                <TimelineItem
                  dotColor={colors.success}
                  text={`Решено · ${formatDate(inc.resolvedAt)}`}
                  notes={inc.resolutionNotes}
                />
              ) : null}
            </View>
          </Section>
        ) : null}
      </ScrollView>
    </SafeArea>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  )
}

function TimelineItem({
  dotColor,
  text,
  notes,
}: {
  dotColor: string
  text: string
  notes?: string | null
}) {
  return (
    <View style={styles.timelineRow}>
      <View style={[styles.timelineDot, { backgroundColor: dotColor }]} />
      <View style={styles.timelineBody}>
        <Text style={styles.timelineText}>{text}</Text>
        {notes ? <Text style={styles.timelineNotes}>«{notes}»</Text> : null}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    padding: spacing.lg,
    justifyContent: 'center',
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  header: {
    gap: spacing.sm,
  },
  title: {
    color: colors.textPrimary,
    fontWeight: font.weight.semibold,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  timestamp: {
    fontSize: font.size.sm,
    color: colors.textTertiary,
  },
  section: {
    gap: spacing.xs,
  },
  sectionLabel: {
    fontSize: font.size.sm,
    color: colors.textSecondary,
    fontWeight: font.weight.medium,
  },
  sectionBody: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.layer1,
    gap: spacing.xs,
  },
  description: {
    fontSize: font.size.base,
    color: colors.textPrimary,
  },
  detail: {
    fontSize: font.size.base,
    color: colors.textPrimary,
  },
  detailMuted: {
    fontSize: font.size.sm,
    color: colors.textTertiary,
  },
  mono: {
    fontFamily: 'monospace',
  },
  photoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  photoTile: {
    width: 100,
    height: 100,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: colors.layer2,
  },
  photoImage: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.layer3,
  },
  photoPlaceholderText: {
    fontSize: font.size.xs,
    color: colors.textTertiary,
  },
  timeline: {
    gap: spacing.sm,
  },
  timelineRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
  },
  timelineBody: {
    flex: 1,
  },
  timelineText: {
    fontSize: font.size.sm,
    color: colors.textPrimary,
  },
  timelineNotes: {
    marginTop: 2,
    fontSize: font.size.xs,
    color: colors.textTertiary,
    fontStyle: 'italic',
  },
})

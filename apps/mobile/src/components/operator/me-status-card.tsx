import { Card } from '@/components/ui/card'
import { colors, font, radius, spacing } from '@/theme/tokens'
import { typography } from '@/theme/typography'
import { StyleSheet, Text, View } from 'react-native'

interface Props {
  canWork: boolean
  reasons: string[]
}

/**
 * Hero card на /me (M2) — canWork binary indicator с semantic tone
 * (success/danger, НЕ brand). Reasons список показывается если !canWork.
 *
 * Дизайн-параллель с web MeStatusCard (B3-UI-4): тот же принцип
 * semantic background + иконка + title + subtitle + checklist причин.
 * Текст вместо lucide иконок — RN эмодзи подходит для MVP (react-native-
 * svg стек планируется отдельным slice'ом в backlog).
 */
export function MeStatusCard({ canWork, reasons }: Props) {
  const tone = canWork ? 'success' : 'danger'
  const iconBg = canWork ? colors.success : colors.danger
  const title = canWork ? 'Вы можете работать' : 'Работа заблокирована'
  const subtitle = canWork
    ? 'Все необходимые условия выполнены'
    : 'Выполните условия ниже, чтобы начать работу'

  return (
    <Card tone={tone}>
      <View style={styles.header}>
        <View style={[styles.iconBadge, { backgroundColor: iconBg }]}>
          <Text style={styles.iconGlyph}>{canWork ? '✓' : '!'}</Text>
        </View>
        <View style={styles.titleBlock}>
          <Text style={typography.heading2}>{title}</Text>
          <Text style={[typography.bodySecondary, styles.subtitle]}>{subtitle}</Text>
        </View>
      </View>

      {!canWork && reasons.length > 0 ? (
        <View style={styles.reasonsList}>
          {reasons.map((reason) => (
            <View key={reason} style={styles.reasonItem}>
              <View style={styles.bullet} />
              <Text style={[typography.bodySecondary, styles.reasonText]}>{reason}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  )
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  iconBadge: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGlyph: {
    color: colors.textInverse,
    fontSize: font.size.xl,
    fontWeight: font.weight.bold,
    lineHeight: font.size.xl,
  },
  titleBlock: {
    flex: 1,
    gap: spacing.xs,
  },
  subtitle: {
    marginTop: 2,
  },
  reasonsList: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  reasonItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.danger,
    marginTop: 8,
  },
  reasonText: {
    flex: 1,
  },
})

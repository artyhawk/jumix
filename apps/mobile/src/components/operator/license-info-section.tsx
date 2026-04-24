import { colors, font, spacing } from '@/theme/tokens'
import { typography } from '@/theme/typography'
import { StyleSheet, Text, View } from 'react-native'

const REQUIREMENTS = [
  'Форматы: JPG, PNG, PDF',
  'Максимальный размер: 10 МБ',
  'Срок действия — обязателен',
] as const

/**
 * Static requirement list — установки backend invariant'ов для user.
 */
export function LicenseInfoSection() {
  return (
    <View style={styles.container}>
      <Text style={[typography.overline, styles.heading]}>Требования</Text>
      <View style={styles.list}>
        {REQUIREMENTS.map((req) => (
          <View key={req} style={styles.row}>
            <Text style={styles.bullet}>•</Text>
            <Text style={[typography.bodySecondary, styles.item]}>{req}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: spacing.md,
  },
  heading: {
    marginBottom: spacing.sm,
  },
  list: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  bullet: {
    color: colors.textTertiary,
    fontSize: font.size.base,
    lineHeight: font.size.base * 1.5,
  },
  item: {
    flex: 1,
  },
})

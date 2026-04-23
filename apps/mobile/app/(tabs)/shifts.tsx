import { SafeArea } from '@/components/ui/safe-area'
import { colors, spacing } from '@/theme/tokens'
import { typography } from '@/theme/typography'
import { StyleSheet, Text, View } from 'react-native'

/**
 * /shifts placeholder (M1). Смены, GPS, СИЗ — M4–M6.
 */
export default function ShiftsScreen() {
  return (
    <SafeArea edges={['bottom']}>
      <View style={styles.container}>
        <Text style={typography.heading2}>Смены</Text>
        <View style={styles.placeholder}>
          <Text style={typography.caption}>
            Смены, GPS-трекинг и подтверждение СИЗ появятся в M4.
          </Text>
        </View>
      </View>
    </SafeArea>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  placeholder: {
    flex: 1,
    padding: spacing.lg,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderSubtle,
    backgroundColor: colors.layer2,
    justifyContent: 'center',
    alignItems: 'center',
  },
})

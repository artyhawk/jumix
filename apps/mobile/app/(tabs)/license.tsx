import { SafeArea } from '@/components/ui/safe-area'
import { colors, spacing } from '@/theme/tokens'
import { typography } from '@/theme/typography'
import { StyleSheet, Text, View } from 'react-native'

/**
 * /license placeholder (M1). Upload flow — в M3.
 */
export default function LicenseScreen() {
  return (
    <SafeArea edges={['bottom']}>
      <View style={styles.container}>
        <Text style={typography.heading2}>Удостоверение</Text>
        <View style={styles.placeholder}>
          <Text style={typography.caption}>
            Загрузка и просмотр удостоверения крановщика будут доступны в M3.
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

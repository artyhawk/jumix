import { Button } from '@/components/ui/button'
import { SafeArea } from '@/components/ui/safe-area'
import { useAuthStore } from '@/stores/auth'
import { colors, spacing } from '@/theme/tokens'
import { typography } from '@/theme/typography'
import { StyleSheet, Text, View } from 'react-native'

/**
 * /me placeholder (M1). Полноценный экран (canWork indicator + identity
 * + license status + memberships) — в M2.
 */
export default function MeScreen() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)

  return (
    <SafeArea edges={['bottom']}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={typography.heading1}>
            Привет, {user?.name?.split(' ')[0] ?? 'крановщик'}
          </Text>
          <Text style={typography.bodySecondary}>
            Профиль будет доступен в следующем обновлении (M2)
          </Text>
        </View>

        <View style={styles.placeholder}>
          <Text style={typography.caption}>
            Здесь появится: статус работоспособности, удостоверение, список компаний-работодателей.
          </Text>
        </View>

        <Button variant="danger" onPress={logout} fullWidth>
          Выйти
        </Button>
      </View>
    </SafeArea>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: spacing.xl,
    gap: spacing.xl,
  },
  header: {
    gap: spacing.sm,
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

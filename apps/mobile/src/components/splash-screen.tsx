import { colors, font, spacing } from '@/theme/tokens'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'

/**
 * Локальный splash (внутри JS). Используется во время hydration auth store
 * (cold start → читаем refresh token → пробуем refresh). Системный
 * `splash.png` из app.json покрывает time-to-first-paint; этот компонент
 * — всё остальное до `isHydrated=true`.
 */
export function SplashScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.logo}>Jumix</Text>
      <ActivityIndicator color={colors.brand500} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xl,
    backgroundColor: colors.layer0,
  },
  logo: {
    fontSize: 40,
    fontWeight: font.weight.bold,
    color: colors.brand500,
    letterSpacing: -1,
  },
})

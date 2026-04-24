import { colors } from '@/theme/tokens'
import { Stack } from 'expo-router'

/**
 * Nested license stack внутри tab'а. Main (index) — визуальная surface.
 * upload — modal presentation с preview + submit flow.
 */
export default function LicenseLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.layer1 },
        headerTintColor: colors.textPrimary,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.layer0 },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen
        name="upload"
        options={{
          title: 'Загрузка удостоверения',
          presentation: 'modal',
        }}
      />
    </Stack>
  )
}

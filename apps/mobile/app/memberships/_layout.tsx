import { useAuthStore } from '@/stores/auth'
import { colors } from '@/theme/tokens'
import { Redirect, Stack } from 'expo-router'

/**
 * Memberships — nested stack screen вне tab-bar'а. Детали-flow:
 *   /memberships        — список всех трудоустройств
 *   /memberships/[id]   — детали одного membership'а
 *
 * Back-gesture возвращает к (tabs)/me. Защищено auth-редиректом
 * (defence-in-depth; root layout тоже страхует).
 */
export default function MembershipsLayout() {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Redirect href="/(auth)/login" />

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.layer1 },
        headerTintColor: colors.textPrimary,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.layer0 },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Компании' }} />
      <Stack.Screen name="[id]" options={{ title: 'Детали' }} />
    </Stack>
  )
}

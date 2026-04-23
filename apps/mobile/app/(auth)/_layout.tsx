import { useAuthStore } from '@/stores/auth'
import { Redirect, Stack } from 'expo-router'

/**
 * Auth group layout. Redirect уже аутентифицированных на `(tabs)/me`.
 */
export default function AuthLayout() {
  const user = useAuthStore((s) => s.user)
  if (user) return <Redirect href="/(tabs)/me" />
  return <Stack screenOptions={{ headerShown: false }} />
}

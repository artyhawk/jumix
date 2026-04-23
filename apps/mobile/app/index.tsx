import { useAuthStore } from '@/stores/auth'
import { Redirect } from 'expo-router'

/**
 * Root index — редиректит на основе auth state. Без этого файла Expo
 * Router на cold start не знает какую группу открывать и падает в
 * `+not-found`.
 */
export default function Index() {
  const user = useAuthStore((s) => s.user)
  if (user) return <Redirect href="/(tabs)/me" />
  return <Redirect href="/(auth)/login" />
}

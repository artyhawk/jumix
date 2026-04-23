import { SplashScreen } from '@/components/splash-screen'
import { useAuthStore } from '@/stores/auth'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useMemo } from 'react'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'

/**
 * Root layout — hydration gate + providers (M1).
 *
 * Cold start sequence:
 *  1. Native splash (app.json splash.image) показан до JS ready
 *  2. React root mounts → useEffect запускает hydrate()
 *  3. SplashScreen component показан пока !isHydrated
 *  4. После hydrate → Stack navigator рендерит (auth) или (tabs)
 *
 * Auth routing сам решается в `(auth)/_layout.tsx` и `(tabs)/_layout.tsx`
 * через `user` state (Redirect если role mismatch).
 */
export default function RootLayout() {
  const queryClient = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            // На mobile offline → fallback на cached data если возможно;
            // R-Q refetchOnReconnect default true — подходит.
            staleTime: 30 * 1000,
          },
        },
      }),
    [],
  )

  const hydrate = useAuthStore((s) => s.hydrate)
  const isHydrated = useAuthStore((s) => s.isHydrated)

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  if (!isHydrated) {
    return (
      <SafeAreaProvider>
        <SplashScreen />
        <StatusBar style="light" />
      </SafeAreaProvider>
    )
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="+not-found" />
          </Stack>
          <StatusBar style="light" />
        </SafeAreaProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  )
}

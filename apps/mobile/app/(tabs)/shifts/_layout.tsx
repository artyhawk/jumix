import { colors } from '@/theme/tokens'
import { Stack } from 'expo-router'

/**
 * Nested shifts stack (M4). index — main surface. start — modal crane
 * selection. history + [id] — навигация через обычный push.
 */
export default function ShiftsLayout() {
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
      <Stack.Screen name="start" options={{ headerShown: false, presentation: 'modal' }} />
      <Stack.Screen name="history" options={{ title: 'История смен' }} />
      <Stack.Screen name="[id]" options={{ title: 'Смена' }} />
      <Stack.Screen name="incidents" options={{ headerShown: false }} />
    </Stack>
  )
}

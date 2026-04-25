import { colors } from '@/theme/tokens'
import { Stack } from 'expo-router'

/**
 * Nested «Начать смену» flow (M6, ADR 0008): crane selection → pre-shift
 * checklist → POST /shifts/start atomic. Stack уровень — чтобы back-button
 * между шагами работал натурально. Modal-presentation определяется
 * родительским shifts/_layout.tsx через Stack.Screen name="start".
 */
export default function StartShiftLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.layer1 },
        headerTintColor: colors.textPrimary,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.layer0 },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Выбор крана' }} />
      <Stack.Screen name="checklist" options={{ title: 'Проверка СИЗ' }} />
    </Stack>
  )
}

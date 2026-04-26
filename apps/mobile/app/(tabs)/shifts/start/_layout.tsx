import { colors } from '@/theme/tokens'
import { Stack, router } from 'expo-router'
import { Pressable, Text } from 'react-native'

/**
 * Nested «Начать смену» flow (M6, ADR 0008): crane selection → pre-shift
 * checklist → POST /shifts/start atomic. Stack уровень — чтобы back-button
 * между шагами работал натурально. Modal-presentation определяется
 * родительским shifts/_layout.tsx через Stack.Screen name="start".
 *
 * `index` (первый шаг — crane selection) добавляет "Отмена" headerLeft —
 * это вход в modal flow, юзер должен иметь возможность закрыть весь
 * нагибаемый wizard. `checklist` — обычный back автоматический.
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
      <Stack.Screen
        name="index"
        options={{
          title: 'Выбор крана',
          headerLeft: () => (
            <Pressable
              onPress={() => router.back()}
              accessibilityRole="button"
              accessibilityLabel="Закрыть"
              hitSlop={10}
            >
              <Text style={{ color: colors.brand500, fontSize: 16 }}>Отмена</Text>
            </Pressable>
          ),
        }}
      />
      <Stack.Screen name="checklist" options={{ title: 'Проверка СИЗ' }} />
    </Stack>
  )
}

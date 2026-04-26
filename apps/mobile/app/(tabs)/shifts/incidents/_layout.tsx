import { colors } from '@/theme/tokens'
import { Stack, router } from 'expo-router'
import { Pressable, Text } from 'react-native'

/**
 * Incidents nested stack под shifts (M6, ADR 0008). Operator surface —
 * own history (index) + create (new modal) + detail ([id]).
 *
 * `new` — modal presentation. iOS обычно поддерживает swipe-down-to-dismiss,
 * но не у всех пользователей gesture очевиден (особенно с заполненной
 * формой). Добавляем явную "Отмена" в headerLeft.
 */
export default function IncidentsLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.layer1 },
        headerTintColor: colors.textPrimary,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.layer0 },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Мои сообщения' }} />
      <Stack.Screen
        name="new"
        options={{
          title: 'Сообщить',
          presentation: 'modal',
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
      <Stack.Screen name="[id]" options={{ title: 'Сообщение' }} />
    </Stack>
  )
}

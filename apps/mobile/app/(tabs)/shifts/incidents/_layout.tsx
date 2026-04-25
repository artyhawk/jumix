import { colors } from '@/theme/tokens'
import { Stack } from 'expo-router'

/**
 * Incidents nested stack под shifts (M6, ADR 0008). Operator surface —
 * own history (index) + create (new modal) + detail ([id]).
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
      <Stack.Screen name="new" options={{ title: 'Сообщить', presentation: 'modal' }} />
      <Stack.Screen name="[id]" options={{ title: 'Сообщение' }} />
    </Stack>
  )
}

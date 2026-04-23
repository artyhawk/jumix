import { useAuthStore } from '@/stores/auth'
import { colors } from '@/theme/tokens'
import { Redirect, Tabs } from 'expo-router'
import { Text } from 'react-native'

/**
 * Tabs layout — 3 таба (me/license/shifts). Redirect на login если
 * нет user'а (defence-in-depth; hydrate уже чистит state если refresh fail).
 *
 * Placeholder icons (Text-emoji) в M1 — заменить на react-native-svg
 * vector icons в M2 (когда добавим lucide-react-native или аналог).
 */
export default function TabsLayout() {
  const user = useAuthStore((s) => s.user)
  if (!user) return <Redirect href="/(auth)/login" />

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.brand500,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarStyle: {
          backgroundColor: colors.layer1,
          borderTopColor: colors.borderSubtle,
        },
        headerStyle: {
          backgroundColor: colors.layer1,
          borderBottomColor: colors.borderSubtle,
        },
        headerTintColor: colors.textPrimary,
      }}
    >
      <Tabs.Screen
        name="me"
        options={{
          title: 'Профиль',
          tabBarIcon: ({ color }) => <TabIcon color={color}>👤</TabIcon>,
        }}
      />
      <Tabs.Screen
        name="license"
        options={{
          title: 'Удостоверение',
          tabBarIcon: ({ color }) => <TabIcon color={color}>🪪</TabIcon>,
        }}
      />
      <Tabs.Screen
        name="shifts"
        options={{
          title: 'Смены',
          tabBarIcon: ({ color }) => <TabIcon color={color}>🏗️</TabIcon>,
        }}
      />
    </Tabs>
  )
}

function TabIcon({ color, children }: { color: string; children: string }) {
  return <Text style={{ fontSize: 20, color }}>{children}</Text>
}

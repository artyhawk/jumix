import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

/**
 * Test setup для mobile (M1). Мокаем Expo modules чтобы не тянуть
 * native runtime. Реальная интеграция — на device (ручное QA).
 */

// expo-secure-store — in-memory fallback для auth store тестов.
const secureStoreMemory = new Map<string, string>()
vi.mock('expo-secure-store', () => ({
  setItemAsync: vi.fn(async (key: string, value: string) => {
    secureStoreMemory.set(key, value)
  }),
  getItemAsync: vi.fn(async (key: string) => secureStoreMemory.get(key) ?? null),
  deleteItemAsync: vi.fn(async (key: string) => {
    secureStoreMemory.delete(key)
  }),
}))

// Экспортируем для доступа из тестов (clear-хэлпер).
;(globalThis as unknown as { __secureStoreMemory: Map<string, string> }).__secureStoreMemory =
  secureStoreMemory

// expo-router — заглушка навигации.
vi.mock('expo-router', () => ({
  router: {
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    dismiss: vi.fn(),
  },
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    dismiss: vi.fn(),
  }),
  useLocalSearchParams: () => ({}),
  Link: ({ children }: { children: React.ReactNode }) => children,
  Redirect: () => null,
  Stack: Object.assign(() => null, { Screen: () => null }),
  Tabs: Object.assign(() => null, { Screen: () => null }),
}))

// burnt — нативные toasts, в jsdom только сбор вызовов.
vi.mock('burnt', () => ({
  toast: vi.fn(),
  alert: vi.fn(),
  dismissAllAlerts: vi.fn(),
}))

// expo-status-bar
vi.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}))

// expo-splash-screen
vi.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: vi.fn(async () => {}),
  hideAsync: vi.fn(async () => {}),
}))

// expo-clipboard
vi.mock('expo-clipboard', () => ({
  setStringAsync: vi.fn(async () => {}),
  getStringAsync: vi.fn(async () => ''),
}))

// expo-constants
vi.mock('expo-constants', () => ({
  default: { expoConfig: { extra: {} } },
}))

// Expo linking
vi.mock('expo-linking', () => ({
  createURL: (path: string) => `jumix://${path}`,
}))

// react-native-safe-area-context — provider + no-op insets
vi.mock('react-native-safe-area-context', async () => {
  const React = await import('react')
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  }
})

// global fetch mock (per-test overrides)
globalThis.fetch = vi.fn()

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

// expo-file-system/legacy — upload task + file info (M3)
vi.mock('expo-file-system/legacy', () => ({
  createUploadTask: vi.fn(),
  getInfoAsync: vi.fn(async () => ({ exists: true, size: 1024 })),
  FileSystemUploadType: { BINARY_CONTENT: 'binary', MULTIPART: 'multipart' },
}))

// expo-image-manipulator — compress
vi.mock('expo-image-manipulator', () => ({
  manipulateAsync: vi.fn(async (uri: string) => ({
    uri: `${uri}-compressed.jpg`,
    width: 1600,
    height: 1200,
  })),
  SaveFormat: { JPEG: 'jpeg', PNG: 'png' },
}))

// expo-image-picker — camera + gallery
vi.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: vi.fn(async () => ({ status: 'granted' })),
  requestMediaLibraryPermissionsAsync: vi.fn(async () => ({ status: 'granted' })),
  launchCameraAsync: vi.fn(async () => ({ canceled: true, assets: [] })),
  launchImageLibraryAsync: vi.fn(async () => ({ canceled: true, assets: [] })),
  MediaTypeOptions: { Images: 'Images' },
}))

// expo-document-picker — PDF
vi.mock('expo-document-picker', () => ({
  getDocumentAsync: vi.fn(async () => ({ canceled: true, assets: [] })),
}))

// @react-native-community/datetimepicker — replace с no-op component
vi.mock('@react-native-community/datetimepicker', () => ({
  default: () => null,
}))

// @expo/react-native-action-sheet — inline tap passthrough для тестов
vi.mock('@expo/react-native-action-sheet', async () => {
  const React = await import('react')
  return {
    ActionSheetProvider: ({ children }: { children: React.ReactNode }) =>
      React.createElement(React.Fragment, null, children),
    useActionSheet: () => ({
      showActionSheetWithOptions: vi.fn(),
    }),
  }
})

// global fetch mock (per-test overrides)
globalThis.fetch = vi.fn()

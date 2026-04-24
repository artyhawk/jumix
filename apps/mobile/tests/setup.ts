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

// ---------- M5-b: GPS tracking module mocks ----------

// expo-location — granted defaults; tests override для denied cases.
vi.mock('expo-location', () => ({
  Accuracy: {
    Lowest: 1,
    Low: 2,
    Balanced: 3,
    High: 4,
    Highest: 5,
    BestForNavigation: 6,
  },
  ActivityType: { AutomotiveNavigation: 1 },
  PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
  requestForegroundPermissionsAsync: vi.fn(async () => ({ status: 'granted' })),
  requestBackgroundPermissionsAsync: vi.fn(async () => ({ status: 'granted' })),
  getForegroundPermissionsAsync: vi.fn(async () => ({ status: 'granted' })),
  getBackgroundPermissionsAsync: vi.fn(async () => ({ status: 'granted' })),
  startLocationUpdatesAsync: vi.fn(async () => {}),
  stopLocationUpdatesAsync: vi.fn(async () => {}),
  getCurrentPositionAsync: vi.fn(async () => ({
    coords: {
      latitude: 51.128,
      longitude: 71.43,
      accuracy: 10,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    },
    timestamp: Date.now(),
  })),
}))

// expo-task-manager — registered map для isTaskDefined/isTaskRegisteredAsync.
const registeredTasks = new Set<string>()
vi.mock('expo-task-manager', () => ({
  defineTask: vi.fn((name: string) => {
    registeredTasks.add(name)
  }),
  isTaskDefined: vi.fn((name: string) => registeredTasks.has(name)),
  isTaskRegisteredAsync: vi.fn(async (name: string) => registeredTasks.has(name)),
  unregisterTaskAsync: vi.fn(async (name: string) => {
    registeredTasks.delete(name)
  }),
  unregisterAllTasksAsync: vi.fn(async () => {
    registeredTasks.clear()
  }),
}))

// @react-native-community/netinfo — connected default.
vi.mock('@react-native-community/netinfo', () => ({
  default: {
    fetch: vi.fn(async () => ({ isConnected: true, type: 'wifi' })),
    addEventListener: vi.fn(() => () => {}),
  },
}))

// @react-native-async-storage/async-storage — in-memory Map.
const asyncStorageMemory = new Map<string, string>()
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async (key: string) => asyncStorageMemory.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      asyncStorageMemory.set(key, value)
    }),
    removeItem: vi.fn(async (key: string) => {
      asyncStorageMemory.delete(key)
    }),
    clear: vi.fn(async () => asyncStorageMemory.clear()),
  },
}))
;(globalThis as unknown as { __asyncStorageMemory: Map<string, string> }).__asyncStorageMemory =
  asyncStorageMemory

// expo-sqlite — in-memory simulation (tests override когда нужен real SQL).
// Minimal stub: хранит массив rows, поддерживает INSERT/SELECT/UPDATE/DELETE
// через простейший in-memory state для queue.test.ts. Для более сложных
// тестов — vi.mock на module boundary сверху.
const sqlRows = new Map<string, Map<number, Record<string, unknown>>>()
let sqlAutoId = 0
function ensureTable(name: string) {
  if (!sqlRows.has(name)) sqlRows.set(name, new Map())
  const t = sqlRows.get(name)
  if (!t) throw new Error('sqlRows ensureTable failed')
  return t
}
const fakeDb = {
  execAsync: vi.fn(async () => {}),
  runAsync: vi.fn(async (source: string, ...params: unknown[]) => {
    // Flatten variadic args: если params[0] is array, use it, иначе params itself
    const args = Array.isArray(params[0]) ? (params[0] as unknown[]) : params
    if (/^\s*INSERT INTO location_pings_queue/i.test(source)) {
      sqlAutoId += 1
      const row = {
        id: sqlAutoId,
        shift_id: args[0],
        latitude: args[1],
        longitude: args[2],
        accuracy_meters: args[3],
        recorded_at: args[4],
        inside_geofence: args[5],
        synced_at: null,
        attempts: 0,
      }
      ensureTable('location_pings_queue').set(sqlAutoId, row)
      return { lastInsertRowId: sqlAutoId, changes: 1 }
    }
    if (/^\s*UPDATE location_pings_queue SET synced_at/i.test(source)) {
      const syncedAt = args[0]
      const ids = args.slice(1) as number[]
      const t = ensureTable('location_pings_queue')
      for (const id of ids) {
        const r = t.get(id)
        if (r) r.synced_at = syncedAt
      }
      return { lastInsertRowId: 0, changes: ids.length }
    }
    if (/^\s*UPDATE location_pings_queue SET attempts/i.test(source)) {
      const ids = args as number[]
      const t = ensureTable('location_pings_queue')
      for (const id of ids) {
        const r = t.get(id)
        if (r) r.attempts = ((r.attempts as number) ?? 0) + 1
      }
      return { lastInsertRowId: 0, changes: ids.length }
    }
    if (/^\s*DELETE FROM location_pings_queue/i.test(source)) {
      const cutoff = args[0] as string
      const t = ensureTable('location_pings_queue')
      for (const [id, row] of t) {
        if (row.synced_at !== null && (row.synced_at as string) < cutoff) t.delete(id)
      }
      return { lastInsertRowId: 0, changes: 0 }
    }
    return { lastInsertRowId: 0, changes: 0 }
  }),
  getFirstAsync: vi.fn(async (source: string, ...params: unknown[]) => {
    if (/COUNT\(\*\)/.test(source)) {
      const t = ensureTable('location_pings_queue')
      const args = Array.isArray(params[0]) ? (params[0] as unknown[]) : params
      const shiftId = args[0] as string | undefined
      let n = 0
      for (const row of t.values()) {
        if (row.synced_at !== null) continue
        if (shiftId && row.shift_id !== shiftId) continue
        n += 1
      }
      return { n }
    }
    return null
  }),
  getAllAsync: vi.fn(async (source: string, ...params: unknown[]) => {
    const t = ensureTable('location_pings_queue')
    const args = Array.isArray(params[0]) ? (params[0] as unknown[]) : params
    const all = Array.from(t.values())
    if (/WHERE shift_id = \? AND synced_at IS NULL/.test(source)) {
      const shiftId = args[0]
      const limit = args[1] as number
      return all
        .filter((r) => r.shift_id === shiftId && r.synced_at === null)
        .sort((a, b) => String(a.recorded_at).localeCompare(String(b.recorded_at)))
        .slice(0, limit)
    }
    if (/WHERE shift_id = \?\s+ORDER BY recorded_at DESC/.test(source)) {
      const shiftId = args[0]
      const limit = args[1] as number
      return all
        .filter((r) => r.shift_id === shiftId)
        .sort((a, b) => String(b.recorded_at).localeCompare(String(a.recorded_at)))
        .slice(0, limit)
    }
    return []
  }),
  closeAsync: vi.fn(async () => {}),
}
vi.mock('expo-sqlite', () => ({
  openDatabaseAsync: vi.fn(async () => fakeDb),
}))
;(
  globalThis as unknown as { __sqlTables: Map<string, Map<number, Record<string, unknown>>> }
).__sqlTables = sqlRows

// global fetch mock (per-test overrides)
globalThis.fetch = vi.fn()

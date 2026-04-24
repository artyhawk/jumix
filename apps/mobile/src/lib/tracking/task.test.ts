import * as shiftsApi from '@/lib/api/shifts'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ACTIVE_SHIFT_STORAGE_KEY } from './lifecycle'
import { __resetQueueForTests, getPendingPings, initQueue } from './queue'
import { __resetSyncForTests } from './sync'
// Import registers TaskManager task at module-load time
import { handleBackgroundLocation } from './task'

vi.mock('@/lib/api/shifts', async () => ({
  ingestPings: vi.fn(),
  endShift: vi.fn(),
  getAvailableCranes: vi.fn(),
  getMyActiveShift: vi.fn(),
  getShift: vi.fn(),
  getShiftPath: vi.fn(),
  listMyShifts: vi.fn(),
  pauseShift: vi.fn(),
  resumeShift: vi.fn(),
  startShift: vi.fn(),
}))

function clearSqlTables() {
  const tables = (
    globalThis as unknown as {
      __sqlTables: Map<string, Map<number, Record<string, unknown>>>
    }
  ).__sqlTables
  tables.clear()
}

beforeEach(async () => {
  clearSqlTables()
  await __resetQueueForTests()
  await initQueue()
  __resetSyncForTests()
  vi.mocked(shiftsApi.ingestPings).mockReset()
  await AsyncStorage.removeItem(ACTIVE_SHIFT_STORAGE_KEY)
})

afterEach(async () => {
  await __resetQueueForTests()
})

const site = {
  id: 'site-1',
  latitude: 51.128,
  longitude: 71.43,
  geofenceRadiusM: 200,
}

async function setActiveContext(shiftId: string) {
  await AsyncStorage.setItem(
    ACTIVE_SHIFT_STORAGE_KEY,
    JSON.stringify({ shiftId, site, startedAt: new Date().toISOString() }),
  )
}

function makeLocation(lat: number, lng: number, accuracy: number | null = 10) {
  return {
    coords: {
      latitude: lat,
      longitude: lng,
      accuracy,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    },
    timestamp: Date.now(),
  }
}

describe('handleBackgroundLocation', () => {
  it('enqueues pings с computed insideGeofence', async () => {
    await setActiveContext('shift-1')
    vi.mocked(shiftsApi.ingestPings).mockResolvedValue({ accepted: 1, rejected: [] })

    await handleBackgroundLocation({
      data: { locations: [makeLocation(51.128, 71.43, 5)] },
      error: null,
    })

    const pending = await getPendingPings('shift-1')
    // После tryFlushQueue accepted helper marks synced, so pending = 0.
    // Проверяем что запись была создана через raw SQL dump.
    const tables = (
      globalThis as unknown as {
        __sqlTables: Map<string, Map<number, Record<string, unknown>>>
      }
    ).__sqlTables
    const queueTable = tables.get('location_pings_queue')
    expect(queueTable?.size).toBe(1)
    const [row] = queueTable?.values() ?? []
    expect(row?.shift_id).toBe('shift-1')
    expect(row?.inside_geofence).toBe(1) // center of geofence → inside
    expect(pending.length).toBe(0) // synced после flush
  })

  it('ping за границей → inside_geofence=false (outside)', async () => {
    await setActiveContext('shift-1')
    vi.mocked(shiftsApi.ingestPings).mockRejectedValue(new Error('skip flush'))
    // 0.01° lat ≈ 1.1km — outside 200m radius

    await handleBackgroundLocation({
      data: { locations: [makeLocation(51.138, 71.43, 10)] },
      error: null,
    })

    const tables = (
      globalThis as unknown as {
        __sqlTables: Map<string, Map<number, Record<string, unknown>>>
      }
    ).__sqlTables
    const [row] = tables.get('location_pings_queue')?.values() ?? []
    expect(row?.inside_geofence).toBe(0)
  })

  it('no active context → no-op', async () => {
    await handleBackgroundLocation({
      data: { locations: [makeLocation(51.128, 71.43)] },
      error: null,
    })
    const tables = (
      globalThis as unknown as {
        __sqlTables: Map<string, Map<number, Record<string, unknown>>>
      }
    ).__sqlTables
    // Table might not exist (initQueue не дёргался if context не set) —
    // в любом случае нет inserted rows.
    expect(tables.get('location_pings_queue')?.size ?? 0).toBe(0)
  })

  it('error in args → no-op, не throws', async () => {
    await setActiveContext('shift-1')
    await expect(
      handleBackgroundLocation({
        data: { locations: [] },
        error: new Error('GPS failed') as unknown as Parameters<
          typeof handleBackgroundLocation
        >[0]['error'],
      }),
    ).resolves.toBeUndefined()
  })

  it('swallows unknown errors (не crash)', async () => {
    await setActiveContext('shift-1')
    vi.mocked(shiftsApi.ingestPings).mockRejectedValue(new Error('unknown'))
    await expect(
      handleBackgroundLocation({
        data: { locations: [makeLocation(51.128, 71.43)] },
        error: null,
      }),
    ).resolves.toBeUndefined()
  })
})

import { ApiError, NetworkError } from '@/lib/api/errors'
import * as shiftsApi from '@/lib/api/shifts'
import NetInfo from '@react-native-community/netinfo'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetQueueForTests,
  countPending,
  enqueuePing,
  getPendingPings,
  initQueue,
} from './queue'
import { __resetSyncForTests, tryFlushQueue } from './sync'

/**
 * Sync tests (M5-b). Проверяют flush под разные response'ы backend'а
 * и network state'ы. Uses queue-stub из setup.ts.
 */

vi.mock('@/lib/api/shifts', async () => ({
  ingestPings: vi.fn(),
  // re-export остальные чтоб mocker не сломал другие импортёры
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
  vi.mocked(NetInfo.fetch).mockResolvedValue({
    isConnected: true,
    type: 'wifi',
    isInternetReachable: true,
    details: null,
  } as unknown as Awaited<ReturnType<typeof NetInfo.fetch>>)
  vi.mocked(shiftsApi.ingestPings).mockReset()
  clearSqlTables()
  await __resetQueueForTests()
  await initQueue()
  __resetSyncForTests()
})

afterEach(async () => {
  await __resetQueueForTests()
})

function ping(offsetSec: number) {
  return {
    latitude: 51.128,
    longitude: 71.43,
    accuracyMeters: 10,
    recordedAt: new Date(Date.now() + offsetSec * 1000).toISOString(),
    insideGeofence: true as boolean | null,
  }
}

describe('tryFlushQueue', () => {
  it('happy: pending pings отправлены, помечены synced', async () => {
    await enqueuePing('s-1', ping(-60))
    await enqueuePing('s-1', ping(-30))

    vi.mocked(shiftsApi.ingestPings).mockResolvedValue({ accepted: 2, rejected: [] })

    const result = await tryFlushQueue('s-1')
    expect(result.attempted).toBe(2)
    expect(result.accepted).toBe(2)
    expect(await countPending('s-1')).toBe(0)
    expect(vi.mocked(shiftsApi.ingestPings)).toHaveBeenCalledTimes(1)
  })

  it('offline (NetInfo disconnected) — skip fetch, leave in queue', async () => {
    await enqueuePing('s-1', ping(-30))
    vi.mocked(NetInfo.fetch).mockResolvedValue({
      isConnected: false,
      type: 'none',
      isInternetReachable: false,
      details: null,
    } as unknown as Awaited<ReturnType<typeof NetInfo.fetch>>)

    const result = await tryFlushQueue('s-1')
    expect(result.networkError).toBe(false) // не attempted, не networkError
    expect(result.attempted).toBe(0)
    expect(vi.mocked(shiftsApi.ingestPings)).not.toHaveBeenCalled()
    expect(await countPending('s-1')).toBe(1)
  })

  it('NetworkError during fetch — incrementAttempts, leave in queue', async () => {
    await enqueuePing('s-1', ping(-30))
    vi.mocked(shiftsApi.ingestPings).mockRejectedValue(new NetworkError())

    const result = await tryFlushQueue('s-1')
    expect(result.networkError).toBe(true)
    expect(await countPending('s-1')).toBe(1)
    const [pending] = await getPendingPings('s-1')
    expect(pending?.attempts).toBe(1)
  })

  it('5xx server error — incrementAttempts, leave in queue', async () => {
    await enqueuePing('s-1', ping(-30))
    vi.mocked(shiftsApi.ingestPings).mockRejectedValue(
      new ApiError('INTERNAL', 'Server error', 500),
    )
    const result = await tryFlushQueue('s-1')
    expect(result.accepted).toBe(0)
    expect(await countPending('s-1')).toBe(1)
    const [pending] = await getPendingPings('s-1')
    expect(pending?.attempts).toBe(1)
  })

  it('422 SHIFT_ENDED — mark synced (pings lose, but no retry loop)', async () => {
    await enqueuePing('s-1', ping(-30))
    vi.mocked(shiftsApi.ingestPings).mockRejectedValue(
      new ApiError('SHIFT_ENDED', 'Cannot ingest', 422),
    )
    await tryFlushQueue('s-1')
    expect(await countPending('s-1')).toBe(0) // cleared — won't retry
  })

  it('403 FORBIDDEN — mark synced (same logic)', async () => {
    await enqueuePing('s-1', ping(-30))
    vi.mocked(shiftsApi.ingestPings).mockRejectedValue(new ApiError('FORBIDDEN', 'Denied', 403))
    await tryFlushQueue('s-1')
    expect(await countPending('s-1')).toBe(0)
  })

  it('пустая очередь — no-op, не fetch', async () => {
    const result = await tryFlushQueue('s-1')
    expect(result.attempted).toBe(0)
    expect(vi.mocked(shiftsApi.ingestPings)).not.toHaveBeenCalled()
  })

  it('partial reject — server accepted=1, rejected=1; всё всё равно marked synced', async () => {
    await enqueuePing('s-1', ping(-30))
    await enqueuePing('s-1', ping(200)) // future → server reject
    vi.mocked(shiftsApi.ingestPings).mockResolvedValue({
      accepted: 1,
      rejected: [{ index: 1, reason: 'FUTURE_TIMESTAMP' }],
    })
    const result = await tryFlushQueue('s-1')
    expect(result.accepted).toBe(1)
    expect(result.rejected).toBe(1)
    // Both marked synced — нет смысла retry'ить invalid
    expect(await countPending('s-1')).toBe(0)
  })
})

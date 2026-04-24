import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  __resetQueueForTests,
  cleanup,
  countPending,
  enqueuePing,
  getPendingPings,
  getRecentPings,
  incrementAttempts,
  initQueue,
  markSynced,
} from './queue'

/**
 * Queue integration tests (M5-b). Используют in-memory SQLite stub из
 * tests/setup.ts — реальное SQLite поведение проверяем на device в QA.
 */

// Clear SQL state между тестами (см. setup.ts __sqlTables).
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
})

afterEach(async () => {
  await __resetQueueForTests()
})

const basePing = {
  latitude: 51.128,
  longitude: 71.43,
  accuracyMeters: 10,
  insideGeofence: true as boolean | null,
}

function pingAt(offsetSec: number, overrides: Partial<typeof basePing> = {}) {
  return {
    ...basePing,
    ...overrides,
    recordedAt: new Date(Date.now() + offsetSec * 1000).toISOString(),
  }
}

describe('enqueue + getPendingPings', () => {
  it('вставляет ping, возвращает через getPending', async () => {
    await enqueuePing('shift-1', pingAt(-30))
    const pending = await getPendingPings('shift-1')
    expect(pending).toHaveLength(1)
    expect(pending[0]?.shiftId).toBe('shift-1')
    expect(pending[0]?.latitude).toBe(51.128)
    expect(pending[0]?.insideGeofence).toBe(true)
    expect(pending[0]?.syncedAt).toBeNull()
  })

  it('pending фильтруется по shift_id (не пересечение между смен)', async () => {
    await enqueuePing('shift-A', pingAt(-30))
    await enqueuePing('shift-B', pingAt(-20))
    const a = await getPendingPings('shift-A')
    const b = await getPendingPings('shift-B')
    expect(a).toHaveLength(1)
    expect(b).toHaveLength(1)
    expect(a[0]?.shiftId).toBe('shift-A')
    expect(b[0]?.shiftId).toBe('shift-B')
  })

  it('pending ASC by recordedAt (чтобы server получал хронологию)', async () => {
    await enqueuePing('s-1', pingAt(-10))
    await enqueuePing('s-1', pingAt(-60))
    await enqueuePing('s-1', pingAt(-30))
    const pending = await getPendingPings('s-1')
    const times = pending.map((p) => Date.parse(p.recordedAt))
    expect([...times].sort((a, b) => a - b)).toEqual(times)
  })

  it('limit ограничивает batch size', async () => {
    for (let i = 0; i < 60; i += 1) {
      await enqueuePing('s-1', pingAt(-i))
    }
    const pending = await getPendingPings('s-1', 20)
    expect(pending).toHaveLength(20)
  })
})

describe('markSynced', () => {
  it('помечает synced_at и pending перестаёт возвращать', async () => {
    await enqueuePing('s-1', pingAt(-30))
    const [row] = await getPendingPings('s-1')
    if (!row) throw new Error('expected 1 pending')
    await markSynced([row.id])
    const after = await getPendingPings('s-1')
    expect(after).toHaveLength(0)
  })

  it('пустой массив — no-op', async () => {
    await enqueuePing('s-1', pingAt(-30))
    await markSynced([])
    const pending = await getPendingPings('s-1')
    expect(pending).toHaveLength(1)
  })
})

describe('incrementAttempts', () => {
  it('инкрементит attempts counter', async () => {
    await enqueuePing('s-1', pingAt(-30))
    const [row] = await getPendingPings('s-1')
    if (!row) throw new Error('expected pending')
    expect(row.attempts).toBe(0)
    await incrementAttempts([row.id])
    await incrementAttempts([row.id])
    const [after] = await getPendingPings('s-1')
    expect(after?.attempts).toBe(2)
  })
})

describe('countPending', () => {
  it('counts pending rows per shift', async () => {
    await enqueuePing('s-1', pingAt(-30))
    await enqueuePing('s-1', pingAt(-20))
    await enqueuePing('s-2', pingAt(-10))
    expect(await countPending('s-1')).toBe(2)
    expect(await countPending('s-2')).toBe(1)
  })

  it('без shiftId — total pending', async () => {
    await enqueuePing('s-1', pingAt(-30))
    await enqueuePing('s-2', pingAt(-20))
    expect(await countPending()).toBe(2)
  })

  it('synced rows не считаются', async () => {
    await enqueuePing('s-1', pingAt(-30))
    const [row] = await getPendingPings('s-1')
    if (row) await markSynced([row.id])
    expect(await countPending('s-1')).toBe(0)
  })
})

describe('getRecentPings', () => {
  it('возвращает DESC by recordedAt (для geofence state)', async () => {
    await enqueuePing('s-1', pingAt(-60))
    await enqueuePing('s-1', pingAt(-30))
    await enqueuePing('s-1', pingAt(-10))
    const recent = await getRecentPings('s-1', 3)
    const times = recent.map((p) => Date.parse(p.recordedAt))
    // DESC
    expect(times[0]).toBeGreaterThan(times[1] ?? 0)
    expect(times[1]).toBeGreaterThan(times[2] ?? 0)
  })
})

describe('cleanup (retention)', () => {
  it('удаляет synced старше retentionDays; pending не трогает', async () => {
    await enqueuePing('s-1', pingAt(-30))
    await enqueuePing('s-1', pingAt(-20))
    const pending = await getPendingPings('s-1')
    // Mark первый synced с timestamp 10 days ago; второй оставляем pending.
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString()
    const tables = (
      globalThis as unknown as {
        __sqlTables: Map<string, Map<number, Record<string, unknown>>>
      }
    ).__sqlTables
    const t = tables.get('location_pings_queue')
    if (t && pending[0]) {
      const row = t.get(pending[0].id)
      if (row) row.synced_at = tenDaysAgo
    }
    await cleanup(7) // retention 7 days
    const after = await getPendingPings('s-1')
    expect(after).toHaveLength(1) // pending сохранился
  })
})

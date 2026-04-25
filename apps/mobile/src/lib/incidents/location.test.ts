import { describe, expect, it, vi } from 'vitest'

// Mock queue.getRecentPings before importing module-under-test.
vi.mock('@/lib/tracking/queue', () => ({
  getRecentPings: vi.fn(),
}))

import { getRecentPings } from '@/lib/tracking/queue'
import { getRecentLocationForIncident } from './location'

describe('getRecentLocationForIncident', () => {
  it('returns null when shiftId is undefined/null', async () => {
    expect(await getRecentLocationForIncident(undefined)).toBeNull()
    expect(await getRecentLocationForIncident(null)).toBeNull()
    expect(vi.mocked(getRecentPings)).not.toHaveBeenCalled()
  })

  it('returns coords when recent ping exists (≤ 5min)', async () => {
    const now = new Date('2026-04-25T12:00:00Z').getTime()
    vi.mocked(getRecentPings).mockResolvedValueOnce([
      {
        id: 1,
        shiftId: 's-1',
        latitude: 51.128,
        longitude: 71.43,
        accuracyMeters: 10,
        recordedAt: '2026-04-25T11:58:00Z', // 2 min ago
        insideGeofence: true,
        syncedAt: null,
        attempts: 0,
      },
    ])
    const result = await getRecentLocationForIncident('s-1', now)
    expect(result).not.toBeNull()
    expect(result?.latitude).toBe(51.128)
    expect(result?.longitude).toBe(71.43)
    expect(result?.ageMs).toBeGreaterThan(0)
  })

  it('returns null when ping is stale (> 5min)', async () => {
    const now = new Date('2026-04-25T12:00:00Z').getTime()
    vi.mocked(getRecentPings).mockResolvedValueOnce([
      {
        id: 1,
        shiftId: 's-1',
        latitude: 51.128,
        longitude: 71.43,
        accuracyMeters: 10,
        recordedAt: '2026-04-25T11:50:00Z', // 10 min ago
        insideGeofence: true,
        syncedAt: null,
        attempts: 0,
      },
    ])
    expect(await getRecentLocationForIncident('s-1', now)).toBeNull()
  })

  it('returns null when no pings', async () => {
    vi.mocked(getRecentPings).mockResolvedValueOnce([])
    expect(await getRecentLocationForIncident('s-1')).toBeNull()
  })

  it('returns null when SQLite throws (offline-tolerant)', async () => {
    vi.mocked(getRecentPings).mockRejectedValueOnce(new Error('sqlite gone'))
    expect(await getRecentLocationForIncident('s-1')).toBeNull()
  })
})

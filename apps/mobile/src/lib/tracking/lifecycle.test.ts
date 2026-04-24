import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Location from 'expo-location'
import * as TaskManager from 'expo-task-manager'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ACTIVE_SHIFT_STORAGE_KEY,
  LOCATION_TASK_NAME,
  __resetTrackingForTests,
  getActiveTrackingContext,
  startTracking,
  stopTracking,
} from './lifecycle'
import { PermissionDeniedError } from './permissions'

beforeEach(async () => {
  await __resetTrackingForTests()
  vi.mocked(Location.startLocationUpdatesAsync).mockReset()
  vi.mocked(Location.stopLocationUpdatesAsync).mockReset()
  vi.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue({
    status: 'granted',
  } as Awaited<ReturnType<typeof Location.requestForegroundPermissionsAsync>>)
  vi.mocked(Location.requestBackgroundPermissionsAsync).mockResolvedValue({
    status: 'granted',
  } as Awaited<ReturnType<typeof Location.requestBackgroundPermissionsAsync>>)
  vi.mocked(TaskManager.isTaskRegisteredAsync).mockResolvedValue(false)
})

afterEach(async () => {
  await __resetTrackingForTests()
})

const site = {
  id: 'site-1',
  latitude: 51.128,
  longitude: 71.43,
  geofenceRadiusM: 200,
}

describe('startTracking', () => {
  it('happy: caches context, requests permissions, starts updates', async () => {
    await startTracking({ shiftId: 'shift-1', site })

    const ctx = await getActiveTrackingContext()
    expect(ctx).not.toBeNull()
    expect(ctx?.shiftId).toBe('shift-1')
    expect(ctx?.site).toEqual(site)

    expect(vi.mocked(Location.requestForegroundPermissionsAsync)).toHaveBeenCalled()
    expect(vi.mocked(Location.requestBackgroundPermissionsAsync)).toHaveBeenCalled()
    expect(vi.mocked(Location.startLocationUpdatesAsync)).toHaveBeenCalledWith(
      LOCATION_TASK_NAME,
      expect.objectContaining({
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 60_000,
        showsBackgroundLocationIndicator: true,
      }),
    )
  })

  it('permission denied (foreground) — throws PermissionDeniedError, не startLocationUpdates', async () => {
    vi.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue({
      status: 'denied',
    } as Awaited<ReturnType<typeof Location.requestForegroundPermissionsAsync>>)

    let err: unknown
    try {
      await startTracking({ shiftId: 'shift-1', site })
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(PermissionDeniedError)
    expect(vi.mocked(Location.startLocationUpdatesAsync)).not.toHaveBeenCalled()
  })

  it('stale task — stops previous до start (crash recovery)', async () => {
    vi.mocked(TaskManager.isTaskRegisteredAsync).mockResolvedValue(true)
    await startTracking({ shiftId: 'shift-2', site })
    expect(vi.mocked(Location.stopLocationUpdatesAsync)).toHaveBeenCalledWith(LOCATION_TASK_NAME)
    expect(vi.mocked(Location.startLocationUpdatesAsync)).toHaveBeenCalled()
  })
})

describe('stopTracking', () => {
  it('stops updates + clears context', async () => {
    vi.mocked(TaskManager.isTaskRegisteredAsync).mockResolvedValue(true)
    await AsyncStorage.setItem(
      ACTIVE_SHIFT_STORAGE_KEY,
      JSON.stringify({ shiftId: 'shift-1', site, startedAt: new Date().toISOString() }),
    )

    await stopTracking()

    expect(vi.mocked(Location.stopLocationUpdatesAsync)).toHaveBeenCalledWith(LOCATION_TASK_NAME)
    expect(await AsyncStorage.getItem(ACTIVE_SHIFT_STORAGE_KEY)).toBeNull()
  })

  it('idempotent — не падает если task не registered', async () => {
    vi.mocked(TaskManager.isTaskRegisteredAsync).mockResolvedValue(false)
    await expect(stopTracking()).resolves.toBeUndefined()
    expect(vi.mocked(Location.stopLocationUpdatesAsync)).not.toHaveBeenCalled()
  })
})

describe('getActiveTrackingContext', () => {
  it('returns null когда пусто', async () => {
    const ctx = await getActiveTrackingContext()
    expect(ctx).toBeNull()
  })

  it('parses сохранённый JSON', async () => {
    await AsyncStorage.setItem(
      ACTIVE_SHIFT_STORAGE_KEY,
      JSON.stringify({ shiftId: 'abc', site, startedAt: '2026-04-25T10:00:00.000Z' }),
    )
    const ctx = await getActiveTrackingContext()
    expect(ctx?.shiftId).toBe('abc')
    expect(ctx?.startedAt).toBe('2026-04-25T10:00:00.000Z')
  })

  it('graceful на corrupted JSON — null', async () => {
    await AsyncStorage.setItem(ACTIVE_SHIFT_STORAGE_KEY, 'not-json{{')
    const ctx = await getActiveTrackingContext()
    expect(ctx).toBeNull()
  })
})

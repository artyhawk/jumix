import * as Location from 'expo-location'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PermissionDeniedError,
  ensureTrackingPermissions,
  getTrackingPermissionStatus,
} from './permissions'

beforeEach(() => {
  vi.mocked(Location.requestForegroundPermissionsAsync).mockReset()
  vi.mocked(Location.requestBackgroundPermissionsAsync).mockReset()
  vi.mocked(Location.getForegroundPermissionsAsync).mockReset()
  vi.mocked(Location.getBackgroundPermissionsAsync).mockReset()
})

describe('ensureTrackingPermissions', () => {
  it('both granted → resolves', async () => {
    vi.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue({
      status: 'granted',
    } as Awaited<ReturnType<typeof Location.requestForegroundPermissionsAsync>>)
    vi.mocked(Location.requestBackgroundPermissionsAsync).mockResolvedValue({
      status: 'granted',
    } as Awaited<ReturnType<typeof Location.requestBackgroundPermissionsAsync>>)
    await expect(ensureTrackingPermissions()).resolves.toBeUndefined()
  })

  it('foreground denied → throws PermissionDeniedError foreground', async () => {
    vi.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue({
      status: 'denied',
    } as Awaited<ReturnType<typeof Location.requestForegroundPermissionsAsync>>)

    let err: unknown
    try {
      await ensureTrackingPermissions()
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(PermissionDeniedError)
    expect((err as PermissionDeniedError).kind).toBe('foreground')
    expect(vi.mocked(Location.requestBackgroundPermissionsAsync)).not.toHaveBeenCalled()
  })

  it('background denied → throws PermissionDeniedError background', async () => {
    vi.mocked(Location.requestForegroundPermissionsAsync).mockResolvedValue({
      status: 'granted',
    } as Awaited<ReturnType<typeof Location.requestForegroundPermissionsAsync>>)
    vi.mocked(Location.requestBackgroundPermissionsAsync).mockResolvedValue({
      status: 'denied',
    } as Awaited<ReturnType<typeof Location.requestBackgroundPermissionsAsync>>)

    let err: unknown
    try {
      await ensureTrackingPermissions()
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(PermissionDeniedError)
    expect((err as PermissionDeniedError).kind).toBe('background')
  })
})

describe('getTrackingPermissionStatus', () => {
  it('returns both statuses', async () => {
    vi.mocked(Location.getForegroundPermissionsAsync).mockResolvedValue({
      status: 'granted',
    } as Awaited<ReturnType<typeof Location.getForegroundPermissionsAsync>>)
    vi.mocked(Location.getBackgroundPermissionsAsync).mockResolvedValue({
      status: 'denied',
    } as Awaited<ReturnType<typeof Location.getBackgroundPermissionsAsync>>)
    const result = await getTrackingPermissionStatus()
    expect(result.foreground).toBe('granted')
    expect(result.background).toBe('denied')
  })
})

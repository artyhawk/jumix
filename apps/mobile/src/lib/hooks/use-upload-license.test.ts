import { __resetApiClient } from '@/lib/api/client'
import { useAuthStore } from '@/stores/auth'
import { act, renderHook, waitFor } from '@testing-library/react'
import * as LegacyFS from 'expo-file-system/legacy'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createQueryWrapper } from '../../../tests/query-wrapper'
import { ME_STATUS_QUERY_KEY } from './use-me'
import { useUploadLicense } from './use-upload-license'

const MOCK_PRESIGNED = {
  uploadUrl: 'https://minio.example.com/put/path',
  key: 'crane-profiles/p1/license/v2/license.jpg',
  version: 2,
  headers: { 'x-amz-signature': 'abc123' },
  expiresAt: '2026-04-23T13:00:00Z',
}

const MOCK_CONFIRMED_PROFILE = {
  id: 'p1',
  licenseVersion: 2,
  licenseExpiresAt: '2027-04-01',
}

function mockFetchPresignedThenConfirm() {
  vi.mocked(globalThis.fetch as ReturnType<typeof vi.fn>)
    .mockResolvedValueOnce(
      new Response(JSON.stringify(MOCK_PRESIGNED), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify(MOCK_CONFIRMED_PROFILE), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
}

beforeEach(() => {
  __resetApiClient()
  useAuthStore.setState({
    user: {
      id: 'u1',
      phone: '+77001234567',
      role: 'operator',
      organizationId: null,
      name: 'Ерлан',
    },
    accessToken: 'acc',
    isHydrated: true,
  })
  vi.mocked(globalThis.fetch as ReturnType<typeof vi.fn>).mockReset()
  vi.mocked(LegacyFS.createUploadTask).mockReset()
})

afterEach(() => {
  useAuthStore.setState({ user: null, accessToken: null, isHydrated: false })
})

describe('useUploadLicense', () => {
  it('three-phase happy path: presign → PUT → confirm + invalidate', async () => {
    mockFetchPresignedThenConfirm()
    vi.mocked(LegacyFS.createUploadTask).mockReturnValue({
      uploadAsync: vi.fn(async () => ({ status: 200, body: 'OK', headers: {} })),
    } as never)

    const { wrapper, client } = createQueryWrapper()
    const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useUploadLicense(), { wrapper })

    await act(async () => {
      await result.current.uploadAsync({
        fileUri: 'file:///tmp/license.jpg',
        fileName: 'license.jpg',
        mimeType: 'image/jpeg',
        expiresAt: '2027-04-01',
      })
    })

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ME_STATUS_QUERY_KEY })
    const fetchMock = vi.mocked(globalThis.fetch as ReturnType<typeof vi.fn>)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/me/license/upload-url')
    expect(fetchMock.mock.calls[1]?.[0]).toContain('/me/license/confirm')
  })

  it('PUT status 4xx → throws LICENSE_UPLOAD_FAILED, confirm не вызван', async () => {
    vi.mocked(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify(MOCK_PRESIGNED), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.mocked(LegacyFS.createUploadTask).mockReturnValue({
      uploadAsync: vi.fn(async () => ({ status: 403, body: 'SignatureDoesNotMatch', headers: {} })),
    } as never)

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useUploadLicense(), { wrapper })

    await expect(
      act(async () => {
        await result.current.uploadAsync({
          fileUri: 'file:///tmp/a.jpg',
          fileName: 'a.jpg',
          mimeType: 'image/jpeg',
          expiresAt: '2027-04-01',
        })
      }),
    ).rejects.toThrow('LICENSE_UPLOAD_FAILED')

    // Confirm step НЕ вызывался — только presign fetch
    expect(vi.mocked(globalThis.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1)
  })

  it('progress callback обновляет state 0..1', async () => {
    mockFetchPresignedThenConfirm()
    let cb: ((e: { totalBytesSent: number; totalBytesExpectedToSend: number }) => void) | undefined
    vi.mocked(LegacyFS.createUploadTask).mockImplementation((_url, _uri, _opts, progressCb) => {
      cb = progressCb as typeof cb
      return {
        uploadAsync: vi.fn(async () => {
          cb?.({ totalBytesSent: 250, totalBytesExpectedToSend: 1000 })
          cb?.({ totalBytesSent: 1000, totalBytesExpectedToSend: 1000 })
          return { status: 200, body: 'OK', headers: {} }
        }),
      } as never
    })

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useUploadLicense(), { wrapper })

    await act(async () => {
      await result.current.uploadAsync({
        fileUri: 'file:///tmp/a.jpg',
        fileName: 'a.jpg',
        mimeType: 'image/jpeg',
        expiresAt: '2027-04-01',
      })
    })

    // После success progress resets to 0
    await waitFor(() => expect(result.current.progress).toBe(0))
  })

  it('confirm endpoint 409 → mutation error с ApiError', async () => {
    vi.mocked(globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(
        new Response(JSON.stringify(MOCK_PRESIGNED), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { code: 'CRANE_PROFILE_NOT_APPROVED', message: 'not approved' },
          }),
          { status: 409, headers: { 'content-type': 'application/json' } },
        ),
      )
    vi.mocked(LegacyFS.createUploadTask).mockReturnValue({
      uploadAsync: vi.fn(async () => ({ status: 200, body: 'OK', headers: {} })),
    } as never)

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useUploadLicense(), { wrapper })

    await expect(
      act(async () => {
        await result.current.uploadAsync({
          fileUri: 'file:///tmp/a.jpg',
          fileName: 'a.jpg',
          mimeType: 'image/jpeg',
          expiresAt: '2027-04-01',
        })
      }),
    ).rejects.toThrow('not approved')
  })

  it('reset() clears error + progress', async () => {
    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useUploadLicense(), { wrapper })

    act(() => {
      result.current.reset()
    })
    expect(result.current.progress).toBe(0)
    expect(result.current.error).toBeNull()
  })
})

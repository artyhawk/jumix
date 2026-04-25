import { __resetApiClient } from '@/lib/api/client'
import { useAuthStore } from '@/stores/auth'
import { act, renderHook, waitFor } from '@testing-library/react'
import * as LegacyFS from 'expo-file-system/legacy'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createQueryWrapper } from '../../../tests/query-wrapper'
import { useCreateIncident } from './use-incidents'

const MOCK_PRESIGNED_PHOTO = {
  uploadUrl: 'memory://put/pending/u-1/uuid-a/photo.jpg',
  key: 'pending/u-1/uuid-a/photo.jpg',
  headers: { 'Content-Type': 'image/jpeg' },
  expiresAt: '2026-04-25T13:00:00Z',
}

const MOCK_INCIDENT = {
  id: 'inc-1',
  type: 'crane_malfunction',
  severity: 'warning',
  status: 'submitted',
  description: 'Шум при подъёме стрелы крана',
  reporter: { id: 'u-1', name: 'Op', phone: '+77000000000' },
  organizationId: 'org-1',
  shiftId: null,
  siteId: null,
  craneId: null,
  reportedAt: '2026-04-25T10:00:00Z',
  acknowledgedAt: null,
  acknowledgedByUserId: null,
  resolvedAt: null,
  resolvedByUserId: null,
  resolutionNotes: null,
  latitude: null,
  longitude: null,
  photos: [],
  createdAt: '2026-04-25T10:00:00Z',
  updatedAt: '2026-04-25T10:00:00Z',
}

beforeEach(() => {
  __resetApiClient()
  useAuthStore.setState({
    user: {
      id: 'u-1',
      phone: '+77000000000',
      role: 'operator',
      organizationId: null,
      name: 'Op',
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

describe('useCreateIncident', () => {
  it('happy path с 0 photos: skip upload, create incident', async () => {
    vi.mocked(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify(MOCK_INCIDENT), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    )
    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useCreateIncident(), { wrapper })

    await act(async () => {
      await result.current.createAsync({
        type: 'crane_malfunction',
        severity: 'warning',
        description: 'Шум при подъёме стрелы крана',
        photos: [],
      })
    })

    const fetchMock = vi.mocked(globalThis.fetch as ReturnType<typeof vi.fn>)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/api/v1/incidents')
  })

  it('happy path с 1 photo: presign → PUT → create', async () => {
    vi.mocked(globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(
        new Response(JSON.stringify(MOCK_PRESIGNED_PHOTO), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(MOCK_INCIDENT), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
      )
    vi.mocked(LegacyFS.createUploadTask).mockReturnValue({
      uploadAsync: vi.fn(async () => ({ status: 200, body: 'OK', headers: {} })),
    } as never)

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useCreateIncident(), { wrapper })

    await act(async () => {
      await result.current.createAsync({
        type: 'other',
        severity: 'info',
        description: 'Описание происшествия достаточной длины',
        photos: [{ fileUri: 'file:///tmp/a.jpg', fileName: 'a.jpg', mimeType: 'image/jpeg' }],
      })
    })

    const fetchMock = vi.mocked(globalThis.fetch as ReturnType<typeof vi.fn>)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0]?.[0]).toContain('/incidents/photos/upload-url')
    expect(fetchMock.mock.calls[1]?.[0]).toContain('/api/v1/incidents')
    // Body of create call should include photoKeys
    const lastBody = fetchMock.mock.calls[1]?.[1] as { body: string } | undefined
    expect(lastBody?.body).toContain('pending/u-1/uuid-a/photo.jpg')
  })

  it('PUT status 4xx → throws IncidentPhotoUploadFailedError; create НЕ вызывается', async () => {
    vi.mocked(globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
      new Response(JSON.stringify(MOCK_PRESIGNED_PHOTO), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    )
    vi.mocked(LegacyFS.createUploadTask).mockReturnValue({
      uploadAsync: vi.fn(async () => ({ status: 403, body: 'SignatureDoesNotMatch', headers: {} })),
    } as never)

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useCreateIncident(), { wrapper })

    await expect(
      act(async () => {
        await result.current.createAsync({
          type: 'other',
          severity: 'info',
          description: 'Описание происшествия достаточной длины',
          photos: [{ fileUri: 'file:///tmp/a.jpg', fileName: 'a.jpg', mimeType: 'image/jpeg' }],
        })
      }),
    ).rejects.toThrow('INCIDENT_PHOTO_UPLOAD_FAILED')

    // Только presign fetch — create endpoint не достигнут.
    expect(vi.mocked(globalThis.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1)
  })

  it('multi-photo (2): both presigned + uploaded, then create', async () => {
    const presigned1 = { ...MOCK_PRESIGNED_PHOTO, key: 'pending/u-1/uuid-a/p1.jpg' }
    const presigned2 = { ...MOCK_PRESIGNED_PHOTO, key: 'pending/u-1/uuid-b/p2.jpg' }
    vi.mocked(globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(
        new Response(JSON.stringify(presigned1), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(presigned2), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(MOCK_INCIDENT), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
      )
    vi.mocked(LegacyFS.createUploadTask).mockReturnValue({
      uploadAsync: vi.fn(async () => ({ status: 200, body: 'OK', headers: {} })),
    } as never)

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useCreateIncident(), { wrapper })

    await act(async () => {
      await result.current.createAsync({
        type: 'near_miss',
        severity: 'critical',
        description: 'Опасная ситуация на стройке',
        photos: [
          { fileUri: 'file:///tmp/p1.jpg', fileName: 'p1.jpg', mimeType: 'image/jpeg' },
          { fileUri: 'file:///tmp/p2.jpg', fileName: 'p2.jpg', mimeType: 'image/jpeg' },
        ],
      })
    })

    const fetchMock = vi.mocked(globalThis.fetch as ReturnType<typeof vi.fn>)
    expect(fetchMock).toHaveBeenCalledTimes(3) // 2 presigns + 1 create
    const createCall = fetchMock.mock.calls[2]?.[1] as { body: string } | undefined
    expect(createCall?.body).toContain('pending/u-1/uuid-a/p1.jpg')
    expect(createCall?.body).toContain('pending/u-1/uuid-b/p2.jpg')
  })

  it('progress state increments per photo', async () => {
    const presigned = { ...MOCK_PRESIGNED_PHOTO }
    vi.mocked(globalThis.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce(
        new Response(JSON.stringify(presigned), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify(MOCK_INCIDENT), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
      )
    vi.mocked(LegacyFS.createUploadTask).mockReturnValue({
      uploadAsync: vi.fn(async () => ({ status: 200, body: 'OK', headers: {} })),
    } as never)

    const { wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useCreateIncident(), { wrapper })

    await act(async () => {
      await result.current.createAsync({
        type: 'other',
        severity: 'info',
        description: 'Описание происшествия достаточной длины',
        photos: [{ fileUri: 'file:///tmp/a.jpg', fileName: 'a.jpg', mimeType: 'image/jpeg' }],
      })
    })

    // After success progress resets.
    await waitFor(() => {
      expect(result.current.progress.uploadedCount).toBe(0)
      expect(result.current.progress.currentPhotoIndex).toBeNull()
    })
  })
})

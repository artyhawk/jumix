import { createQueryWrapper } from '@/test-utils/query-wrapper'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '../api/errors'
import type { CraneProfile, MeStatusResponse } from '../api/types'
import { qk } from '../query-keys'
import { useMeStatus, useUploadLicense } from './use-me'

vi.mock('../api/crane-profiles', () => ({
  getMeStatus: vi.fn(),
  requestLicenseUploadUrl: vi.fn(),
  confirmLicense: vi.fn(),
  listCraneProfiles: vi.fn(),
  getCraneProfile: vi.fn(),
  approveCraneProfile: vi.fn(),
  rejectCraneProfile: vi.fn(),
}))
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { toast } from 'sonner'
import { confirmLicense, getMeStatus, requestLicenseUploadUrl } from '../api/crane-profiles'

const getStatus = vi.mocked(getMeStatus)
const requestUrl = vi.mocked(requestLicenseUploadUrl)
const confirm = vi.mocked(confirmLicense)
const toastSuccess = vi.mocked(toast.success)
const toastError = vi.mocked(toast.error)

function makeProfile(overrides: Partial<CraneProfile> = {}): CraneProfile {
  return {
    id: 'cp-1',
    userId: 'u-1',
    firstName: 'Иван',
    lastName: 'Иванов',
    patronymic: null,
    iin: '900101300001',
    phone: '+77010000001',
    avatarUrl: null,
    approvalStatus: 'approved',
    rejectionReason: null,
    approvedAt: '2026-04-01T10:00:00Z',
    rejectedAt: null,
    licenseStatus: 'valid',
    licenseExpiresAt: '2027-04-20',
    licenseUrl: null,
    licenseVersion: 1,
    createdAt: '2026-04-01T10:00:00Z',
    updatedAt: '2026-04-01T10:00:00Z',
    ...overrides,
  }
}

function makeStatus(overrides: Partial<MeStatusResponse> = {}): MeStatusResponse {
  return {
    profile: makeProfile(),
    memberships: [],
    licenseStatus: 'valid',
    canWork: true,
    canWorkReasons: [],
    ...overrides,
  }
}

beforeEach(() => {
  getStatus.mockReset()
  requestUrl.mockReset()
  confirm.mockReset()
  toastSuccess.mockReset()
  toastError.mockReset()
})

describe('useMeStatus', () => {
  it('fetches /me/status and caches', async () => {
    getStatus.mockResolvedValueOnce(makeStatus())
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useMeStatus(), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.canWork).toBe(true)
    expect(getStatus).toHaveBeenCalledTimes(1)
  })

  it('surfaces canWorkReasons from backend', async () => {
    getStatus.mockResolvedValueOnce(
      makeStatus({
        canWork: false,
        canWorkReasons: ['Удостоверение не загружено'],
      }),
    )
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useMeStatus(), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.canWorkReasons).toEqual(['Удостоверение не загружено'])
  })
})

describe('useUploadLicense', () => {
  const fetchMock = vi.fn()
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    fetchMock.mockReset()
    globalThis.fetch = fetchMock as unknown as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('orchestrates request-url → PUT → confirm → toast + invalidate', async () => {
    requestUrl.mockResolvedValueOnce({
      uploadUrl: 'https://minio.local/put',
      key: 'crane-profiles/cp-1/license/v2/doc.pdf',
      version: 2,
      headers: { 'x-amz-meta-version': '2' },
      expiresAt: '2026-04-20T11:00:00Z',
    })
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 } as Response)
    confirm.mockResolvedValueOnce(makeProfile({ licenseVersion: 2 }))

    const { client, Wrapper } = createQueryWrapper()
    const spy = vi.spyOn(client, 'invalidateQueries')
    const { result } = renderHook(() => useUploadLicense(), { wrapper: Wrapper })

    const file = new File(['content'], 'doc.pdf', { type: 'application/pdf' })
    await act(async () => {
      await result.current.mutateAsync({ file, expiresAt: '2027-04-20' })
    })

    expect(requestUrl).toHaveBeenCalledWith({
      contentType: 'application/pdf',
      filename: 'doc.pdf',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'https://minio.local/put',
      expect.objectContaining({ method: 'PUT', body: file }),
    )
    expect(confirm).toHaveBeenCalledWith({
      key: 'crane-profiles/cp-1/license/v2/doc.pdf',
      expiresAt: '2027-04-20',
    })
    expect(toastSuccess).toHaveBeenCalledWith('Удостоверение загружено')
    const invalidated = spy.mock.calls.map((c) => c[0]?.queryKey)
    expect(invalidated).toEqual(expect.arrayContaining([qk.meStatus]))
  })

  it('non-allowed file type — aborted before request-url', async () => {
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useUploadLicense(), { wrapper: Wrapper })
    const file = new File(['x'], 'doc.gif', { type: 'image/gif' })
    await act(async () => {
      await result.current.mutateAsync({ file, expiresAt: '2027-04-20' }).catch(() => {})
    })
    expect(requestUrl).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalledWith(
      'Не удалось загрузить удостоверение',
      expect.objectContaining({ description: expect.stringContaining('формат') }),
    )
  })

  it('non-OK PUT response → toast + no confirm', async () => {
    requestUrl.mockResolvedValueOnce({
      uploadUrl: 'https://minio.local/put',
      key: 'key',
      version: 1,
      headers: {},
      expiresAt: '2026-04-20T11:00:00Z',
    })
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 } as Response)
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useUploadLicense(), { wrapper: Wrapper })
    const file = new File(['x'], 'doc.pdf', { type: 'application/pdf' })
    await act(async () => {
      await result.current.mutateAsync({ file, expiresAt: '2027-04-20' }).catch(() => {})
    })
    expect(confirm).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalledWith(
      'Не удалось загрузить удостоверение',
      expect.objectContaining({ description: expect.stringContaining('Загрузка прервалась') }),
    )
  })

  it('confirm rejects with AppError → toast surfaces message', async () => {
    requestUrl.mockResolvedValueOnce({
      uploadUrl: 'https://minio.local/put',
      key: 'key',
      version: 1,
      headers: {},
      expiresAt: '2026-04-20T11:00:00Z',
    })
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 } as Response)
    confirm.mockRejectedValueOnce(
      new AppError({
        code: 'LICENSE_CONFIRM_KEY_MISMATCH',
        message: 'Key prefix mismatch',
        statusCode: 400,
      }),
    )
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useUploadLicense(), { wrapper: Wrapper })
    const file = new File(['x'], 'doc.pdf', { type: 'application/pdf' })
    await act(async () => {
      await result.current.mutateAsync({ file, expiresAt: '2027-04-20' }).catch(() => {})
    })
    expect(toastError).toHaveBeenCalledWith(
      'Не удалось загрузить удостоверение',
      expect.objectContaining({ description: 'Key prefix mismatch' }),
    )
  })
})

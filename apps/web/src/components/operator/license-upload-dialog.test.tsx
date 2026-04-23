import { createQueryWrapper } from '@/test-utils/query-wrapper'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api/crane-profiles', () => ({
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

import { confirmLicense, requestLicenseUploadUrl } from '@/lib/api/crane-profiles'
import { LicenseUploadDialog } from './license-upload-dialog'

const requestUrl = vi.mocked(requestLicenseUploadUrl)
const confirm = vi.mocked(confirmLicense)

function renderDialog() {
  const { Wrapper } = createQueryWrapper()
  return render(
    <Wrapper>
      <LicenseUploadDialog open={true} onOpenChange={() => {}} />
    </Wrapper>,
  )
}

const fetchMock = vi.fn()
const originalFetch = globalThis.fetch

beforeEach(() => {
  requestUrl.mockReset()
  confirm.mockReset()
  fetchMock.mockReset()
  globalThis.fetch = fetchMock as unknown as typeof fetch
})

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('LicenseUploadDialog', () => {
  it('renders title + description + controls', () => {
    renderDialog()
    expect(screen.getByText('Загрузка удостоверения')).toBeInTheDocument()
    expect(screen.getByText(/JPG, PNG, PDF до 10 МБ/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Загрузить' })).toBeInTheDocument()
    expect(screen.getByLabelText('Срок действия удостоверения')).toBeInTheDocument()
  })

  it('Загрузить disabled по дефолту (нет file + date)', () => {
    renderDialog()
    expect(screen.getByRole('button', { name: 'Загрузить' })).toBeDisabled()
  })

  it('invalid file type — показывает inline error, file НЕ сохраняется', async () => {
    renderDialog()
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['x'], 'photo.gif', { type: 'image/gif' })
    // `userEvent.upload` respects the `accept` attr and won't fire onChange для
    // disallowed types; fireEvent.change bypasses проверку, имитируя drop или
    // accept='*' сценарий — валидация должна отработать в nашем handleFile.
    Object.defineProperty(input, 'files', { value: [file], configurable: true })
    fireEvent.change(input)
    expect(await screen.findByText('Допустимые форматы: JPG, PNG, PDF')).toBeInTheDocument()
  })

  it('oversize file (>10MB) — inline error', async () => {
    renderDialog()
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const big = new File([new Uint8Array(11 * 1024 * 1024)], 'big.pdf', {
      type: 'application/pdf',
    })
    Object.defineProperty(input, 'files', { value: [big], configurable: true })
    fireEvent.change(input)
    expect(await screen.findByText(/Файл больше 10 МБ/)).toBeInTheDocument()
  })

  it('valid file + date → submit orchestrates upload flow', async () => {
    requestUrl.mockResolvedValueOnce({
      uploadUrl: 'https://minio.local/put',
      key: 'crane-profiles/cp-1/license/v2/doc.pdf',
      version: 2,
      headers: {},
      expiresAt: '2026-04-20T11:00:00Z',
    })
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200 } as Response)
    confirm.mockResolvedValueOnce({
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
      approvedAt: null,
      rejectedAt: null,
      licenseStatus: 'valid',
      licenseExpiresAt: '2027-04-20',
      licenseUrl: null,
      licenseVersion: 2,
      createdAt: '2026-04-01T10:00:00Z',
      updatedAt: '2026-04-20T11:00:00Z',
    })

    renderDialog()
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(['x'], 'doc.pdf', { type: 'application/pdf' })
    await userEvent.upload(input, file)

    const date = screen.getByLabelText('Срок действия удостоверения') as HTMLInputElement
    await userEvent.clear(date)
    await userEvent.type(date, '2027-04-20')

    const submit = screen.getByRole('button', { name: 'Загрузить' })
    await waitFor(() => expect(submit).not.toBeDisabled())
    await userEvent.click(submit)

    await waitFor(() =>
      expect(requestUrl).toHaveBeenCalledWith({
        contentType: 'application/pdf',
        filename: 'doc.pdf',
      }),
    )
    expect(fetchMock).toHaveBeenCalledWith(
      'https://minio.local/put',
      expect.objectContaining({ method: 'PUT' }),
    )
    expect(confirm).toHaveBeenCalledWith({
      key: 'crane-profiles/cp-1/license/v2/doc.pdf',
      expiresAt: '2027-04-20',
    })
  })

  it('Отмена button closes dialog', async () => {
    const onOpenChange = vi.fn()
    const { Wrapper } = createQueryWrapper()
    render(
      <Wrapper>
        <LicenseUploadDialog open={true} onOpenChange={onOpenChange} />
      </Wrapper>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

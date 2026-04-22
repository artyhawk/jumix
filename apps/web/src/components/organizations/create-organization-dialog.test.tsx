import type { Organization } from '@/lib/api/types'
import { createQueryWrapper } from '@/test-utils/query-wrapper'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api/organizations', () => ({
  listOrganizations: vi.fn(),
  getOrganization: vi.fn(),
  createOrganization: vi.fn(),
  suspendOrganization: vi.fn(),
  activateOrganization: vi.fn(),
}))
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import * as orgsApi from '@/lib/api/organizations'
import { CreateOrganizationDialog } from './create-organization-dialog'

const create = vi.mocked(orgsApi.createOrganization)

function mockCreateResponse(org: Partial<Organization> = {}) {
  return {
    organization: {
      id: 'o-1',
      name: 'ТОО «Альфа»',
      bin: '123456789013',
      status: 'active' as const,
      contactName: null,
      contactPhone: null,
      contactEmail: null,
      createdAt: '2026-04-22T10:00:00Z',
      updatedAt: '2026-04-22T10:00:00Z',
      ...org,
    },
    owner: { id: 'u-1', phone: '+77010001122' },
  }
}

beforeEach(() => {
  create.mockReset()
})

describe('CreateOrganizationDialog', () => {
  it('does not render when closed', () => {
    const { Wrapper } = createQueryWrapper()
    render(<CreateOrganizationDialog open={false} onOpenChange={() => {}} />, { wrapper: Wrapper })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows validation errors for empty required fields', async () => {
    const { Wrapper } = createQueryWrapper()
    render(<CreateOrganizationDialog open onOpenChange={() => {}} />, { wrapper: Wrapper })
    const submit = screen.getByRole('button', { name: 'Создать' })
    await userEvent.click(submit)
    await waitFor(() => {
      expect(screen.getByText('Укажите название')).toBeInTheDocument()
    })
    expect(create).not.toHaveBeenCalled()
  })

  it('rejects invalid BIN', async () => {
    const { Wrapper } = createQueryWrapper()
    render(<CreateOrganizationDialog open onOpenChange={() => {}} />, { wrapper: Wrapper })
    await userEvent.type(screen.getByLabelText(/Название/), 'ТОО «Альфа»')
    await userEvent.type(screen.getByLabelText(/^БИН/), '123456789012')
    await userEvent.type(screen.getByLabelText(/Имя владельца/), 'Иван Петров')
    await userEvent.type(screen.getByLabelText(/Телефон владельца/), '+77010001122')
    await userEvent.click(screen.getByRole('button', { name: 'Создать' }))
    await waitFor(() => {
      expect(screen.getByText(/Неверный БИН/)).toBeInTheDocument()
    })
    expect(create).not.toHaveBeenCalled()
  })

  it('submits with E.164 normalized phones on valid input', async () => {
    create.mockResolvedValueOnce(mockCreateResponse())
    const onOpenChange = vi.fn()
    const { Wrapper } = createQueryWrapper()
    render(<CreateOrganizationDialog open onOpenChange={onOpenChange} />, { wrapper: Wrapper })

    await userEvent.type(screen.getByLabelText(/Название/), 'ТОО «Альфа»')
    await userEvent.type(screen.getByLabelText(/^БИН/), '123456789013')
    await userEvent.type(screen.getByLabelText(/Имя владельца/), 'Иван Петров')
    fireEvent.change(screen.getByLabelText(/Телефон владельца/), {
      target: { value: '+77010001122' },
    })
    await userEvent.click(screen.getByRole('button', { name: 'Создать' }))

    await waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    const payload = create.mock.calls[0]![0]
    expect(payload.name).toBe('ТОО «Альфа»')
    expect(payload.bin).toBe('123456789013')
    expect(payload.ownerName).toBe('Иван Петров')
    expect(payload.ownerPhone).toBe('+77010001122')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

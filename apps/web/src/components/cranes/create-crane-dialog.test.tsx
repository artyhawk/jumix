import type { Crane } from '@/lib/api/types'
import { createQueryWrapper } from '@/test-utils/query-wrapper'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/api/cranes', () => ({
  createCrane: vi.fn(),
  listCranes: vi.fn(),
}))
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import * as cranesApi from '@/lib/api/cranes'
import { toast } from 'sonner'
import { CreateCraneDialog } from './create-crane-dialog'

const create = vi.mocked(cranesApi.createCrane)

function makeCrane(overrides: Partial<Crane> = {}): Crane {
  return {
    id: 'c-1',
    organizationId: 'org-1',
    siteId: null,
    type: 'tower',
    model: 'КБ-403',
    inventoryNumber: null,
    capacityTon: 8,
    boomLengthM: null,
    yearManufactured: null,
    status: 'active',
    approvalStatus: 'pending',
    rejectionReason: null,
    notes: null,
    createdAt: '2026-04-20T10:00:00Z',
    updatedAt: '2026-04-20T10:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  create.mockReset()
  vi.mocked(toast.success).mockReset()
  vi.mocked(toast.error).mockReset()
})

describe('CreateCraneDialog', () => {
  it('does not render when closed', () => {
    const { Wrapper } = createQueryWrapper()
    render(<CreateCraneDialog open={false} onOpenChange={() => {}} />, { wrapper: Wrapper })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders required fields when open', () => {
    const { Wrapper } = createQueryWrapper()
    render(<CreateCraneDialog open onOpenChange={() => {}} />, { wrapper: Wrapper })
    expect(screen.getByText(/^Тип/)).toBeInTheDocument()
    expect(screen.getByText(/^Модель/)).toBeInTheDocument()
    expect(screen.getByText(/Грузоподъёмность/)).toBeInTheDocument()
  })

  it('validates required model + capacity on empty submit', async () => {
    const { Wrapper } = createQueryWrapper()
    render(<CreateCraneDialog open onOpenChange={() => {}} />, { wrapper: Wrapper })
    const submit = screen.getByRole('button', { name: /Отправить на одобрение/ })
    await userEvent.click(submit)
    expect(await screen.findByText(/Укажите модель/)).toBeInTheDocument()
    expect(screen.getByText(/Укажите грузоподъёмность/)).toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
  })

  it('submits with normalized payload', async () => {
    create.mockResolvedValueOnce(makeCrane())
    const onOpenChange = vi.fn()
    const { Wrapper } = createQueryWrapper()
    render(<CreateCraneDialog open onOpenChange={onOpenChange} />, { wrapper: Wrapper })

    await userEvent.type(screen.getByLabelText(/Модель/), 'КБ-405')
    await userEvent.type(screen.getByLabelText(/Инвентарный/), 'INV-100')
    await userEvent.type(screen.getByLabelText(/Грузоподъёмность/), '8')
    await userEvent.type(screen.getByLabelText(/Длина стрелы/), '45')
    await userEvent.type(screen.getByLabelText(/Год выпуска/), '2020')
    await userEvent.click(screen.getByRole('button', { name: /Отправить на одобрение/ }))

    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(create).toHaveBeenCalledWith({
      type: 'tower',
      model: 'КБ-405',
      inventoryNumber: 'INV-100',
      capacityTon: 8,
      boomLengthM: 45,
      yearManufactured: 2020,
    })
    expect(toast.success).toHaveBeenCalledWith(
      'Заявка отправлена на одобрение',
      expect.objectContaining({ description: expect.stringContaining('1–2 дней') }),
    )
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('coerces comma-decimals on capacity/boom', async () => {
    create.mockResolvedValueOnce(makeCrane())
    const { Wrapper } = createQueryWrapper()
    render(<CreateCraneDialog open onOpenChange={() => {}} />, { wrapper: Wrapper })

    await userEvent.type(screen.getByLabelText(/Модель/), 'x')
    await userEvent.type(screen.getByLabelText(/Грузоподъёмность/), '5,5')
    await userEvent.type(screen.getByLabelText(/Длина стрелы/), '30,25')
    await userEvent.click(screen.getByRole('button', { name: /Отправить на одобрение/ }))

    await waitFor(() => expect(create).toHaveBeenCalled())
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ capacityTon: 5.5, boomLengthM: 30.25 }),
    )
  })

  it('rejects year outside allowed range', async () => {
    const { Wrapper } = createQueryWrapper()
    render(<CreateCraneDialog open onOpenChange={() => {}} />, { wrapper: Wrapper })

    await userEvent.type(screen.getByLabelText(/Модель/), 'x')
    await userEvent.type(screen.getByLabelText(/Грузоподъёмность/), '3')
    await userEvent.type(screen.getByLabelText(/Год выпуска/), '1800')
    await userEvent.click(screen.getByRole('button', { name: /Отправить на одобрение/ }))

    expect(await screen.findByText(/Год от 1900/)).toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
  })

  it('surfaces backend error via toast.error', async () => {
    create.mockRejectedValueOnce(new Error('duplicate inventory'))
    const { Wrapper } = createQueryWrapper()
    render(<CreateCraneDialog open onOpenChange={() => {}} />, { wrapper: Wrapper })

    await userEvent.type(screen.getByLabelText(/Модель/), 'x')
    await userEvent.type(screen.getByLabelText(/Грузоподъёмность/), '3')
    await userEvent.click(screen.getByRole('button', { name: /Отправить на одобрение/ }))

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    const firstCall = vi.mocked(toast.error).mock.calls[0]
    expect(firstCall?.[0]).toBe('Не удалось создать')
  })
})

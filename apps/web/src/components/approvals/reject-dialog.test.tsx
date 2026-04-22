import { createQueryWrapper } from '@/test-utils/query-wrapper'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RejectDialog } from './reject-dialog'

vi.mock('@/lib/api/crane-profiles', () => ({
  listCraneProfiles: vi.fn(),
  getCraneProfile: vi.fn(),
  approveCraneProfile: vi.fn(),
  rejectCraneProfile: vi.fn(),
}))
vi.mock('@/lib/api/organization-operators', () => ({
  listOrganizationOperators: vi.fn(),
  getOrganizationOperator: vi.fn(),
  approveOrganizationOperator: vi.fn(),
  rejectOrganizationOperator: vi.fn(),
}))
vi.mock('@/lib/api/cranes', () => ({
  listCranes: vi.fn(),
  getCrane: vi.fn(),
  approveCrane: vi.fn(),
  rejectCrane: vi.fn(),
}))

const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}))

import { rejectCraneProfile } from '@/lib/api/crane-profiles'
import { rejectCrane } from '@/lib/api/cranes'
import { rejectOrganizationOperator } from '@/lib/api/organization-operators'

const rejectCp = vi.mocked(rejectCraneProfile)
const rejectHire = vi.mocked(rejectOrganizationOperator)
const rejectCraneFn = vi.mocked(rejectCrane)

beforeEach(() => {
  rejectCp.mockReset()
  rejectHire.mockReset()
  rejectCraneFn.mockReset()
  toastSuccess.mockReset()
  toastError.mockReset()
})

function renderDialog(props: Partial<React.ComponentProps<typeof RejectDialog>> = {}) {
  const { Wrapper } = createQueryWrapper()
  const onOpenChange = vi.fn()
  const utils = render(
    <Wrapper>
      <RejectDialog
        open
        onOpenChange={onOpenChange}
        entity="crane-profile"
        entityId="p-1"
        entityLabel="Иванов Иван"
        {...props}
      />
    </Wrapper>,
  )
  return { ...utils, onOpenChange }
}

describe('RejectDialog', () => {
  it('does not render dialog content when open=false', () => {
    const { Wrapper } = createQueryWrapper()
    render(
      <Wrapper>
        <RejectDialog
          open={false}
          onOpenChange={() => {}}
          entity="crane-profile"
          entityId="p-1"
          entityLabel="Test"
        />
      </Wrapper>,
    )
    expect(screen.queryByText(/Отклонить заявку/)).toBeNull()
  })

  it('renders title + entity label when open', () => {
    renderDialog()
    expect(screen.getByText('Отклонить заявку крановщика?')).toBeInTheDocument()
    expect(screen.getByText('Иванов Иван')).toBeInTheDocument()
  })

  it('shows reject/cancel/textarea; submit disabled initially', () => {
    renderDialog()
    expect(screen.getByRole('button', { name: 'Отклонить' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Отмена' })).toBeInTheDocument()
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('enables submit after typing reason', async () => {
    renderDialog()
    await userEvent.type(screen.getByRole('textbox'), 'some reason')
    expect(screen.getByRole('button', { name: 'Отклонить' })).not.toBeDisabled()
  })

  it('whitespace-only reason does not enable submit', async () => {
    renderDialog()
    await userEvent.type(screen.getByRole('textbox'), '   ')
    expect(screen.getByRole('button', { name: 'Отклонить' })).toBeDisabled()
  })

  it('displays char counter', async () => {
    renderDialog()
    await userEvent.type(screen.getByRole('textbox'), 'abc')
    expect(screen.getByText('3/500')).toBeInTheDocument()
  })

  it('calls rejectCraneProfile for crane-profile entity', async () => {
    rejectCp.mockResolvedValueOnce({} as never)
    const { onOpenChange } = renderDialog({ entity: 'crane-profile', entityId: 'p-9' })
    await userEvent.type(screen.getByRole('textbox'), 'некорректные документы')
    await userEvent.click(screen.getByRole('button', { name: 'Отклонить' }))
    await waitFor(() => expect(rejectCp).toHaveBeenCalledWith('p-9', 'некорректные документы'))
    expect(toastSuccess).toHaveBeenCalledWith('Заявка отклонена')
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('calls rejectOrganizationOperator for hire entity', async () => {
    rejectHire.mockResolvedValueOnce({} as never)
    renderDialog({ entity: 'hire', entityId: 'h-9' })
    await userEvent.type(screen.getByRole('textbox'), 'duplicate hire')
    await userEvent.click(screen.getByRole('button', { name: 'Отклонить' }))
    await waitFor(() => expect(rejectHire).toHaveBeenCalledWith('h-9', 'duplicate hire'))
  })

  it('calls rejectCrane for crane entity', async () => {
    rejectCraneFn.mockResolvedValueOnce({} as never)
    renderDialog({ entity: 'crane', entityId: 'c-9' })
    await userEvent.type(screen.getByRole('textbox'), 'no docs')
    await userEvent.click(screen.getByRole('button', { name: 'Отклонить' }))
    await waitFor(() => expect(rejectCraneFn).toHaveBeenCalledWith('c-9', 'no docs'))
  })

  it('calls onOpenChange(false) + clears reason on cancel', async () => {
    const { onOpenChange } = renderDialog()
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    await userEvent.type(textarea, 'typed')
    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})

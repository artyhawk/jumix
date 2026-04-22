import { createQueryWrapper } from '@/test-utils/query-wrapper'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateSiteDialog } from './create-site-dialog'

vi.mock('@/lib/api/sites', () => ({
  listSites: vi.fn(),
  getSite: vi.fn(),
  createSite: vi.fn(),
  updateSite: vi.fn(),
  completeSite: vi.fn(),
  archiveSite: vi.fn(),
  activateSite: vi.fn(),
}))
vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

/**
 * MapPicker требует WebGL. Передаём selection через родительский onChange —
 * stub вызывает его сразу и с фиксированными координатами чтобы step 2 прошёл.
 */
vi.mock('@/components/map/map-picker', () => ({
  MapPicker: ({
    onChange,
    value,
  }: {
    onChange: (v: { latitude: number; longitude: number; radiusM: number } | null) => void
    value: { latitude: number; longitude: number; radiusM: number } | null
  }) => (
    <div>
      <button
        type="button"
        onClick={() => onChange({ latitude: 51.17, longitude: 71.45, radiusM: 200 })}
        data-testid="map-picker-stub-pick"
      >
        pick
      </button>
      <span data-testid="map-picker-value">{value ? 'selected' : 'empty'}</span>
    </div>
  ),
}))

import { createSite } from '@/lib/api/sites'
const create = vi.mocked(createSite)

function renderDialog(
  props: { open: boolean; onOpenChange?: (v: boolean) => void } = { open: true },
) {
  const { Wrapper } = createQueryWrapper()
  const onOpenChange = props.onOpenChange ?? vi.fn()
  return {
    onOpenChange,
    ...render(
      <Wrapper>
        <CreateSiteDialog open={props.open} onOpenChange={onOpenChange} />
      </Wrapper>,
    ),
  }
}

beforeEach(() => {
  create.mockReset()
})

describe('CreateSiteDialog', () => {
  it('renders step 1 (name + address) by default', () => {
    renderDialog()
    expect(screen.getByText('Новый объект')).toBeInTheDocument()
    expect(screen.getByText('Данные')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/ЖК|Парк/)).toBeInTheDocument()
  })

  it('validates: name is required to advance to step 2', async () => {
    renderDialog()
    await userEvent.click(screen.getByRole('button', { name: 'Далее' }))
    expect(await screen.findByText('Укажите название')).toBeInTheDocument()
    // Step 2 не должен открыться
    expect(screen.queryByTestId('map-picker-stub-pick')).toBeNull()
  })

  it('advances to step 2 when name is provided', async () => {
    renderDialog()
    await userEvent.type(screen.getByPlaceholderText(/ЖК|Парк/), 'ЖК Новый')
    await userEvent.click(screen.getByRole('button', { name: 'Далее' }))
    await waitFor(() => {
      expect(screen.getByTestId('map-picker-stub-pick')).toBeInTheDocument()
    })
  })

  it('Создать is disabled until location is picked', async () => {
    renderDialog()
    await userEvent.type(screen.getByPlaceholderText(/ЖК|Парк/), 'ЖК Новый')
    await userEvent.click(screen.getByRole('button', { name: 'Далее' }))
    const submit = await screen.findByRole('button', { name: 'Создать' })
    expect(submit).toBeDisabled()
  })

  it('enables Создать after pick + calls createSite with full payload', async () => {
    create.mockResolvedValueOnce({
      id: 's-new',
      organizationId: 'org-1',
      name: 'ЖК Новый',
      address: null,
      latitude: 51.17,
      longitude: 71.45,
      radiusM: 200,
      status: 'active',
      notes: null,
      createdAt: '2026-04-22T10:00:00Z',
      updatedAt: '2026-04-22T10:00:00Z',
    })
    const { onOpenChange } = renderDialog()
    await userEvent.type(screen.getByPlaceholderText(/ЖК|Парк/), 'ЖК Новый')
    await userEvent.click(screen.getByRole('button', { name: 'Далее' }))
    await userEvent.click(await screen.findByTestId('map-picker-stub-pick'))
    await userEvent.click(screen.getByRole('button', { name: 'Создать' }))
    await waitFor(() => {
      expect(create).toHaveBeenCalledWith({
        name: 'ЖК Новый',
        address: undefined,
        latitude: 51.17,
        longitude: 71.45,
        radiusM: 200,
      })
    })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('trimmed address gets sent as undefined when blank', async () => {
    create.mockResolvedValueOnce({
      id: 's-new',
      organizationId: 'org-1',
      name: 'A',
      address: null,
      latitude: 51.17,
      longitude: 71.45,
      radiusM: 200,
      status: 'active',
      notes: null,
      createdAt: '2026-04-22T10:00:00Z',
      updatedAt: '2026-04-22T10:00:00Z',
    })
    renderDialog()
    await userEvent.type(screen.getByPlaceholderText(/ЖК|Парк/), 'A')
    await userEvent.type(screen.getByPlaceholderText(/Абая/), '   ')
    await userEvent.click(screen.getByRole('button', { name: 'Далее' }))
    await userEvent.click(await screen.findByTestId('map-picker-stub-pick'))
    await userEvent.click(screen.getByRole('button', { name: 'Создать' }))
    await waitFor(() => {
      expect(create).toHaveBeenCalledWith(expect.objectContaining({ address: undefined }))
    })
  })

  it('Назад возвращает на step 1', async () => {
    renderDialog()
    await userEvent.type(screen.getByPlaceholderText(/ЖК|Парк/), 'X')
    await userEvent.click(screen.getByRole('button', { name: 'Далее' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Назад' }))
    expect(screen.getByPlaceholderText(/ЖК|Парк/)).toBeInTheDocument()
    expect(screen.queryByTestId('map-picker-stub-pick')).toBeNull()
  })
})

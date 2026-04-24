import type { AvailableCrane } from '@jumix/shared'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { CraneSelectionCard } from './crane-selection-card'

function makeCrane(overrides: Partial<AvailableCrane> = {}): AvailableCrane {
  return {
    id: 'c-1',
    model: 'Liebherr 550EC',
    inventoryNumber: 'INV-001',
    type: 'tower',
    capacityTon: 12,
    site: { id: 's-1', name: 'ЖК Астана Парк', address: 'Абая 1' },
    organization: { id: 'org-1', name: 'ТОО Кран-15' },
    ...overrides,
  }
}

describe('CraneSelectionCard', () => {
  it('renders crane info', () => {
    render(<CraneSelectionCard crane={makeCrane()} onPress={vi.fn()} />)
    expect(screen.getByText('Liebherr 550EC')).toBeInTheDocument()
    expect(screen.getByText('INV-001')).toBeInTheDocument()
    expect(screen.getByText(/Башенный · 12 т/)).toBeInTheDocument()
    expect(screen.getByText('ЖК Астана Парк')).toBeInTheDocument()
  })

  it('onPress fired when tapped', async () => {
    const handler = vi.fn()
    render(<CraneSelectionCard crane={makeCrane()} onPress={handler} />)
    const button = screen.getByRole('button')
    await userEvent.click(button)
    expect(handler).toHaveBeenCalled()
  })

  it('selected=true still renders content (differing style handled by RN primitives)', () => {
    render(<CraneSelectionCard crane={makeCrane()} selected onPress={vi.fn()} />)
    expect(screen.getByText('Liebherr 550EC')).toBeInTheDocument()
    expect(screen.getByRole('button')).toBeInTheDocument()
  })
})

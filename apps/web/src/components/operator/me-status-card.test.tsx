import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MeStatusCard } from './me-status-card'

describe('MeStatusCard', () => {
  it('canWork=true → success heading, без reasons list', () => {
    render(<MeStatusCard canWork={true} reasons={[]} />)
    expect(screen.getByText('Вы можете работать')).toBeInTheDocument()
    expect(screen.getByText('Все необходимые условия выполнены')).toBeInTheDocument()
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('canWork=false → danger heading + reasons list', () => {
    render(
      <MeStatusCard
        canWork={false}
        reasons={['Профиль ожидает одобрения платформой', 'Удостоверение не загружено']}
      />,
    )
    expect(screen.getByText('Работа заблокирована')).toBeInTheDocument()
    expect(screen.getByText('Профиль ожидает одобрения платформой')).toBeInTheDocument()
    expect(screen.getByText('Удостоверение не загружено')).toBeInTheDocument()
  })

  it('loading → placeholder pulse, no content', () => {
    render(<MeStatusCard canWork={false} reasons={[]} loading />)
    expect(screen.queryByText('Работа заблокирована')).toBeNull()
    expect(screen.queryByText('Вы можете работать')).toBeNull()
  })
})

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MeStatusCard } from './me-status-card'

describe('MeStatusCard', () => {
  it('canWork=true — показывает success title + нет reasons', () => {
    render(<MeStatusCard canWork={true} reasons={[]} />)
    expect(screen.getByText('Вы можете работать')).toBeInTheDocument()
    expect(screen.getByText('Все необходимые условия выполнены')).toBeInTheDocument()
  })

  it('canWork=false — показывает danger title + reasons list', () => {
    render(
      <MeStatusCard
        canWork={false}
        reasons={['Профиль ожидает одобрения платформой', 'Нет активных трудоустройств']}
      />,
    )
    expect(screen.getByText('Работа заблокирована')).toBeInTheDocument()
    expect(screen.getByText('Выполните условия ниже, чтобы начать работу')).toBeInTheDocument()
    expect(screen.getByText('Профиль ожидает одобрения платформой')).toBeInTheDocument()
    expect(screen.getByText('Нет активных трудоустройств')).toBeInTheDocument()
  })

  it('canWork=false с пустыми reasons не падает', () => {
    render(<MeStatusCard canWork={false} reasons={[]} />)
    expect(screen.getByText('Работа заблокирована')).toBeInTheDocument()
  })
})

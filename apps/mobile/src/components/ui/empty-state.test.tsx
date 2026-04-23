import { fireEvent, render, screen } from '@testing-library/react'
import { Text } from 'react-native'
import { describe, expect, it, vi } from 'vitest'
import { EmptyState } from './empty-state'

describe('EmptyState', () => {
  it('рендерит title + description', () => {
    render(<EmptyState title="Нет трудоустройств" description="Владелец подаст заявку на найм" />)
    expect(screen.getByText('Нет трудоустройств')).toBeInTheDocument()
    expect(screen.getByText('Владелец подаст заявку на найм')).toBeInTheDocument()
  })

  it('без description — только title', () => {
    render(<EmptyState title="Пусто" />)
    expect(screen.getByText('Пусто')).toBeInTheDocument()
  })

  it('action кнопка фаерит onPress', () => {
    const onPress = vi.fn()
    render(
      <EmptyState
        title="Нет данных"
        action={{ label: 'Обновить', onPress }}
        icon={<Text>🏢</Text>}
      />,
    )
    fireEvent.click(screen.getByText('Обновить'))
    expect(onPress).toHaveBeenCalledOnce()
  })
})

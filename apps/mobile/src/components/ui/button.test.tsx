import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Button } from './button'

describe('Button', () => {
  it('renders text content', () => {
    const { getByText } = render(<Button onPress={() => {}}>Войти</Button>)
    expect(getByText('Войти')).toBeTruthy()
  })

  it('fires onPress when clicked', () => {
    const onPress = vi.fn()
    const { getByText } = render(<Button onPress={onPress}>Войти</Button>)
    fireEvent.click(getByText('Войти'))
    expect(onPress).toHaveBeenCalled()
  })

  it('disabled prevents onPress', () => {
    const onPress = vi.fn()
    const { getByRole } = render(
      <Button onPress={onPress} disabled>
        Войти
      </Button>,
    )
    const btn = getByRole('button')
    fireEvent.click(btn)
    expect(onPress).not.toHaveBeenCalled()
  })

  it('loading показывает спиннер вместо текста', () => {
    const { queryByText } = render(
      <Button onPress={() => {}} loading>
        Войти
      </Button>,
    )
    expect(queryByText('Войти')).toBeNull()
  })

  it('loading state также blocks onPress', () => {
    const onPress = vi.fn()
    const { getByRole } = render(
      <Button onPress={onPress} loading>
        Войти
      </Button>,
    )
    fireEvent.click(getByRole('button'))
    expect(onPress).not.toHaveBeenCalled()
  })
})

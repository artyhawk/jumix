import { render } from '@testing-library/react'
import { router } from 'expo-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LoginScreen from './login'

/**
 * Login screen smoke test (M1). react-native-web alias превращает RN
 * primitives в HTML — click + text render работают; touch gestures
 * не симулируются (реальное QA на device).
 *
 * Фокус на навигации и отправке запроса. Ввод phone симулируем через
 * прямой state mutation в PhoneInput? Нет — render screen + assert
 * что кнопка корректно disabled при пустом номере + header текст.
 */

// Мокаем request-sms чтобы не делать реальный fetch.
vi.mock('@/lib/api/auth', () => ({
  requestSmsCode: vi.fn(),
}))

import { requestSmsCode } from '@/lib/api/auth'

beforeEach(() => {
  vi.mocked(requestSmsCode).mockReset()
  vi.mocked(router.push).mockReset()
})

describe('LoginScreen', () => {
  it('renders заголовок + subtitle', () => {
    const { getByText } = render(<LoginScreen />)
    expect(getByText('Вход')).toBeTruthy()
    expect(getByText(/Введите номер телефона/)).toBeTruthy()
  })

  it('renders "Получить код" button', () => {
    const { getByText } = render(<LoginScreen />)
    expect(getByText('Получить код')).toBeTruthy()
  })

  it('renders "Зарегистрироваться" link', () => {
    const { getByText } = render(<LoginScreen />)
    expect(getByText(/Зарегистрироваться/)).toBeTruthy()
  })

  it('кнопка disabled пока номер не полный', () => {
    const { getByRole } = render(<LoginScreen />)
    const btn = getByRole('button', { name: /Получить код/ })
    // aria-disabled через accessibilityState — RN-web mapping
    expect(btn.getAttribute('aria-disabled')).toBe('true')
  })

  it('phone input имеет label', () => {
    const { getByLabelText } = render(<LoginScreen />)
    expect(getByLabelText('Номер телефона')).toBeTruthy()
  })

  it('requestSmsCode не вызывается пока номер не введён', () => {
    render(<LoginScreen />)
    // Начальный state — номер пустой → обработчик не вызывался
    expect(requestSmsCode).not.toHaveBeenCalled()
    expect(router.push).not.toHaveBeenCalled()
  })
})

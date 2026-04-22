import { describe, expect, it } from 'vitest'
import { t } from './i18n'

describe('t() — i18n', () => {
  it('looks up nested keys', () => {
    expect(t('auth.login.title')).toBe('Войти в Jumix')
  })

  it('interpolates {var} placeholders', () => {
    expect(t('auth.welcome.title', { name: 'Иван' })).toBe('Добро пожаловать, Иван!')
  })

  it('falls back to key when missing', () => {
    expect(t('this.does.not.exist')).toBe('this.does.not.exist')
  })

  it('falls back from kz to ru when key missing in kz', () => {
    expect(t('auth.login.title', undefined, 'kz')).toBe('Войти в Jumix')
  })
})

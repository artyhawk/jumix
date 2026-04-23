import { describe, expect, it } from 'vitest'
import { formatIin, formatPhone, getFullName, getInitials } from './personal'

describe('getInitials', () => {
  it('берёт первую букву фамилии + имени (uppercase)', () => {
    expect(getInitials({ firstName: 'Ерлан', lastName: 'Ахметов' })).toBe('АЕ')
    expect(getInitials({ firstName: 'john', lastName: 'smith' })).toBe('SJ')
  })

  it('возвращает "?" если оба пустые', () => {
    expect(getInitials({ firstName: '', lastName: '' })).toBe('?')
    expect(getInitials({ firstName: '   ', lastName: '' })).toBe('?')
  })

  it('работает когда только одно имя заполнено', () => {
    expect(getInitials({ firstName: 'Аян', lastName: '' })).toBe('А')
  })
})

describe('getFullName', () => {
  it('форматирует Фамилия Имя Отчество', () => {
    expect(getFullName({ firstName: 'Ерлан', lastName: 'Ахметов', patronymic: 'Нурланович' })).toBe(
      'Ахметов Ерлан Нурланович',
    )
  })

  it('пропускает отсутствующее отчество', () => {
    expect(getFullName({ firstName: 'Ерлан', lastName: 'Ахметов', patronymic: null })).toBe(
      'Ахметов Ерлан',
    )
  })

  it('пропускает пустые строки', () => {
    expect(getFullName({ firstName: 'Ерлан', lastName: '', patronymic: '  ' })).toBe('Ерлан')
  })
})

describe('formatIin', () => {
  it('12 цифр → 6+6 с пробелом', () => {
    expect(formatIin('990101300123')).toBe('990101 300123')
  })

  it('нестандартная длина — возвращаем без изменений', () => {
    expect(formatIin('12345')).toBe('12345')
    expect(formatIin('')).toBe('')
  })
})

describe('formatPhone', () => {
  it('KZ E.164 → 3+3+2+2 группы', () => {
    expect(formatPhone('+77001234567')).toBe('+7 700 123 45 67')
  })

  it('не-KZ формат — возвращаем без изменений', () => {
    expect(formatPhone('+12025550123')).toBe('+12025550123')
    expect(formatPhone('77001234567')).toBe('77001234567')
    expect(formatPhone('')).toBe('')
  })
})

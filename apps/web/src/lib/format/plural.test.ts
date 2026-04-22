import { describe, expect, it } from 'vitest'
import { pluralRu } from './plural'

const forms = ['регистрация', 'регистрации', 'регистраций'] as const

describe('pluralRu', () => {
  it('0 → many form', () => {
    expect(pluralRu(0, forms)).toBe('регистраций')
  })

  it("1 → singular; 21, 101 → singular (tens don't overrule mod10)", () => {
    expect(pluralRu(1, forms)).toBe('регистрация')
    expect(pluralRu(21, forms)).toBe('регистрация')
    expect(pluralRu(101, forms)).toBe('регистрация')
  })

  it('2–4 → few form; 22, 23 → few', () => {
    expect(pluralRu(2, forms)).toBe('регистрации')
    expect(pluralRu(3, forms)).toBe('регистрации')
    expect(pluralRu(4, forms)).toBe('регистрации')
    expect(pluralRu(22, forms)).toBe('регистрации')
    expect(pluralRu(23, forms)).toBe('регистрации')
  })

  it('5–20 → many form (teens override mod10)', () => {
    expect(pluralRu(5, forms)).toBe('регистраций')
    expect(pluralRu(11, forms)).toBe('регистраций')
    expect(pluralRu(12, forms)).toBe('регистраций')
    expect(pluralRu(14, forms)).toBe('регистраций')
    expect(pluralRu(20, forms)).toBe('регистраций')
  })

  it('25 → many; negative numbers handled via abs', () => {
    expect(pluralRu(25, forms)).toBe('регистраций')
    expect(pluralRu(-1, forms)).toBe('регистрация')
    expect(pluralRu(-5, forms)).toBe('регистраций')
  })
})

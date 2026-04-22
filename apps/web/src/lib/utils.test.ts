import { describe, expect, it } from 'vitest'
import { colorFromId, initials } from './utils'

describe('initials', () => {
  it('returns single letter for one-word name', () => {
    expect(initials('Иван')).toBe('И')
  })

  it('returns first + last initial for multi-word name', () => {
    expect(initials('Иван Иванов')).toBe('ИИ')
    expect(initials('John Michael Doe')).toBe('JD')
  })

  it('handles empty / whitespace input', () => {
    expect(initials('')).toBe('?')
    expect(initials('   ')).toBe('?')
  })

  it('uppercases the result', () => {
    expect(initials('john doe')).toBe('JD')
  })
})

describe('colorFromId', () => {
  it('returns deterministic color for same id', () => {
    expect(colorFromId('user-1')).toBe(colorFromId('user-1'))
  })

  it('distributes across the palette', () => {
    const colors = new Set<string>()
    for (let i = 0; i < 100; i++) colors.add(colorFromId(`user-${i}`))
    // Хотя бы 4 разных цвета из палитры в 6
    expect(colors.size).toBeGreaterThanOrEqual(4)
  })
})

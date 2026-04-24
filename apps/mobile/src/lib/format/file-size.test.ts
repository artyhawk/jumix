import { describe, expect, it } from 'vitest'
import { formatFileSize } from './file-size'

describe('formatFileSize', () => {
  it('байты для < 1 КБ', () => {
    expect(formatFileSize(0)).toBe('0 Б')
    expect(formatFileSize(512)).toBe('512 Б')
    expect(formatFileSize(1023)).toBe('1023 Б')
  })

  it('КБ для 1024..1048575', () => {
    expect(formatFileSize(1024)).toBe('1.0 КБ')
    expect(formatFileSize(2500)).toBe('2.4 КБ')
    expect(formatFileSize(1024 * 1024 - 1)).toBe('1024.0 КБ')
  })

  it('МБ для ≥ 1 МБ', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1.0 МБ')
    expect(formatFileSize(5.5 * 1024 * 1024)).toBe('5.5 МБ')
    expect(formatFileSize(12 * 1024 * 1024)).toBe('12.0 МБ')
  })

  it('защита от невалидных входов', () => {
    expect(formatFileSize(-100)).toBe('0 Б')
    expect(formatFileSize(Number.NaN)).toBe('0 Б')
  })
})

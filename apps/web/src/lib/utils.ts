import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Объединяет классы с дедупликацией Tailwind'а. Используется во всех UI-компонентах
 * для комбинации base + variant + user className.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Детерминированный цвет для avatar fallback по userId (palette 6 цветов).
 * Hash — простой FNV-like, достаточно для распределения.
 */
export function colorFromId(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  }
  const palette = ['#3b82f6', '#10b981', '#eab308', '#8b5cf6', '#ec4899', '#06b6d4'] as const
  return palette[hash % palette.length] ?? palette[0]
}

/**
 * Короткие инициалы из имени: "Иван Иванов" → "ИИ", "Иван" → "И".
 */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0] ?? ''
  if (parts.length === 1) return first.slice(0, 1).toUpperCase()
  const last = parts[parts.length - 1] ?? ''
  return (first.slice(0, 1) + last.slice(0, 1)).toUpperCase()
}

import enMessages from '@/messages/en.json'
import kzMessages from '@/messages/kz.json'
import ruMessages from '@/messages/ru.json'

export type Locale = 'ru' | 'kz' | 'en'

const dictionaries: Record<Locale, Record<string, unknown>> = {
  ru: ruMessages as Record<string, unknown>,
  kz: kzMessages as Record<string, unknown>,
  en: enMessages as Record<string, unknown>,
}

/**
 * Минимальный translator. Ключи dot-notation: `auth.login.title`.
 * В MVP только русский; KZ dictionary пустая, fallback на ru (backlog).
 *
 * Простейший интерполятор: `Добро пожаловать, {name}!` + `t(key, {name: 'Иван'})`.
 */
export function t(
  key: string,
  vars?: Record<string, string | number>,
  locale: Locale = 'ru',
): string {
  const value = lookup(dictionaries[locale], key) ?? lookup(dictionaries.ru, key) ?? key
  if (typeof value !== 'string') return key
  if (!vars) return value
  return value.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`))
}

function lookup(dict: Record<string, unknown>, key: string): unknown {
  const parts = key.split('.')
  let cur: unknown = dict
  for (const p of parts) {
    if (typeof cur !== 'object' || cur === null) return undefined
    cur = (cur as Record<string, unknown>)[p]
  }
  return cur
}

/**
 * Typed accessor для не-строковых значений в словаре (массивы, объекты).
 * Используется marketing landing'ом (B3-LANDING) для items секций. Fallback — `[]`.
 */
export function tList<T>(key: string, locale: Locale = 'ru'): T[] {
  const value = lookup(dictionaries[locale], key) ?? lookup(dictionaries.ru, key)
  return Array.isArray(value) ? (value as T[]) : []
}

import argon2 from 'argon2'
import { AuthError } from '../errors'

/**
 * Argon2id параметры для server-side хэширования паролей.
 *
 * OWASP 2024 recommendation (https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html):
 *   memoryCost = 19456 KiB (~19 MiB)
 *   timeCost = 2 iterations
 *   parallelism = 1
 *
 * При апгрейде параметров (через 2+ года) — менять только здесь. Старые хэши
 * продолжат валидироваться, needsRehash() вернёт true и caller пересчитает
 * хэш при следующем успешном логине (transparent rotation).
 *
 * Те же параметры используются в packages/db/src/seed.ts для seed-паролей.
 */
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const

/**
 * CLAUDE.md §5.3: минимум 10 символов.
 * Дополнительная проверка зоны zxcvbn — в api-слое при регистрации.
 */
export const MIN_PASSWORD_LENGTH = 10

export async function hashPassword(plaintext: string): Promise<string> {
  if (plaintext.length < MIN_PASSWORD_LENGTH) {
    throw new AuthError(
      'PASSWORD_TOO_SHORT',
      `Password must be at least ${MIN_PASSWORD_LENGTH} characters`,
    )
  }
  return argon2.hash(plaintext, ARGON2_OPTIONS)
}

export async function verifyPassword(hash: string, plaintext: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plaintext)
  } catch {
    // argon2.verify бросает при невалидном формате хэша — трактуем как mismatch
    return false
  }
}

/**
 * True, если хэш был посчитан с устаревшими параметрами и требует пересчёта
 * при следующем успешном логине.
 */
export async function needsRehash(hash: string): Promise<boolean> {
  try {
    return argon2.needsRehash(hash, ARGON2_OPTIONS)
  } catch {
    return true
  }
}

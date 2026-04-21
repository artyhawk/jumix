import { type KeyLike, importPKCS8, importSPKI } from 'jose'
import { AuthError } from '../errors'

const ALG = 'RS256'

/**
 * Загружает private key (PEM PKCS8) для подписи access-токенов.
 * Ожидается формат -----BEGIN PRIVATE KEY-----.
 *
 * В текущем варианте принимает только уже прочитанную PEM-строку.
 * Для prod caller (apps/api) отвечает за чтение из файла (Docker secret,
 * монтируется в /run/secrets/jwt_private_key) или из env (менее безопасно
 * для больших ключей из-за лимитов shell). Рекомендуемый паттерн:
 *   const pem = await readFile(process.env.JWT_PRIVATE_KEY_PATH, 'utf8')
 *   const key = await loadSigningKey(pem)
 *
 * Если понадобится unified loader — добавить в apps/api плагин keys-plugin,
 * а не расширять этот пакет (core не должен зависеть от fs/env семантики).
 */
export async function loadSigningKey(privateKeyPem: string): Promise<KeyLike> {
  try {
    return await importPKCS8(privateKeyPem, ALG)
  } catch {
    throw new AuthError(
      'KEY_INVALID',
      'Failed to import signing key (expected PKCS8 PEM for RS256)',
    )
  }
}

/**
 * Загружает public key (PEM SPKI) для верификации access-токенов.
 * Ожидается формат -----BEGIN PUBLIC KEY-----.
 */
export async function loadVerificationKey(publicKeyPem: string): Promise<KeyLike> {
  try {
    return await importSPKI(publicKeyPem, ALG)
  } catch {
    throw new AuthError(
      'KEY_INVALID',
      'Failed to import verification key (expected SPKI PEM for RS256)',
    )
  }
}

export { ALG as JWT_ALG }

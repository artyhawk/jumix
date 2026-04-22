import { randomUUID } from 'node:crypto'
import { type JWTPayload, type KeyLike, SignJWT, errors as joseErrors, jwtVerify } from 'jose'
import { AuthError } from '../errors'
import type { UserRole } from '../policy/policy'
import { type AccessTokenClaims, accessTokenClaimsSchema } from './claims'
import { JWT_ALG } from './keys'

export type SignAccessInput = {
  userId: string
  organizationId: string | null
  role: UserRole
  tokenVersion: number
}

export type AccessTokenConfig = {
  signingKey: KeyLike
  verificationKey: KeyLike
  /** TTL в секундах. CLAUDE.md §5.1: 15 минут. */
  ttlSeconds: number
  issuer: string
  audience: string
  /** Для тестов — подменяемое время (ms epoch). */
  now?: () => number
}

export async function signAccessToken(
  input: SignAccessInput,
  cfg: AccessTokenConfig,
): Promise<string> {
  const nowMs = cfg.now?.() ?? Date.now()
  const iat = Math.floor(nowMs / 1000)
  const exp = iat + cfg.ttlSeconds
  const jti = randomUUID()

  // B2d-1 (ADR 0003): operator JWT не несёт organizationId — нормализуем
  // здесь, чтобы callers (тесты, token-issuer) могли передавать организацию
  // из users-row не заботясь о роли.
  const normalizedOrg = input.role === 'operator' ? null : input.organizationId
  const payload: JWTPayload = {
    sub: input.userId,
    org: normalizedOrg,
    role: input.role,
    tv: input.tokenVersion,
  }

  return new SignJWT(payload)
    .setProtectedHeader({ alg: JWT_ALG, typ: 'JWT' })
    .setIssuer(cfg.issuer)
    .setAudience(cfg.audience)
    .setJti(jti)
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(cfg.signingKey)
}

/**
 * Верифицирует подпись, iss/aud/exp и схему claims.
 *
 * ВАЖНО — что этот метод НЕ делает (обязанность caller'а):
 *  1. Сверка `claims.tv` с `users.token_version` в БД.
 *     Без этого logout-all (инкремент token_version) не обесценивает
 *     ранее выданные access-токены (CLAUDE.md §5.5).
 *  2. Проверка что пользователь не заблокирован / организация активна.
 *
 * Оба шага выполняются в authenticate-middleware на уровне apps/api,
 * потому что ядро @jumix/auth не должно знать про Drizzle / схему БД.
 *
 * Пример использования (псевдокод):
 *   const claims = await verifyAccessToken(raw, cfg)
 *   const user = await userRepo.findById(claims.sub)
 *   if (!user || user.tokenVersion !== claims.tv) throw Unauthorized()
 *   request.ctx = buildAuthContext(claims, user)
 */
export async function verifyAccessToken(
  token: string,
  cfg: AccessTokenConfig,
): Promise<AccessTokenClaims> {
  let payload: JWTPayload
  try {
    const verified = await jwtVerify(token, cfg.verificationKey, {
      issuer: cfg.issuer,
      audience: cfg.audience,
      algorithms: [JWT_ALG],
      currentDate: cfg.now ? new Date(cfg.now()) : undefined,
    })
    payload = verified.payload
  } catch (cause: unknown) {
    if (cause instanceof joseErrors.JWTExpired) {
      throw new AuthError('TOKEN_EXPIRED', 'Access token expired')
    }
    if (cause instanceof joseErrors.JWTClaimValidationFailed) {
      if (cause.claim === 'iss') {
        throw new AuthError('TOKEN_WRONG_ISSUER', 'Access token issuer mismatch')
      }
      if (cause.claim === 'aud') {
        throw new AuthError('TOKEN_WRONG_AUDIENCE', 'Access token audience mismatch')
      }
      throw new AuthError('TOKEN_CLAIMS_INVALID', `Access token claim invalid: ${cause.claim}`)
    }
    if (cause instanceof joseErrors.JWSSignatureVerificationFailed) {
      throw new AuthError('TOKEN_INVALID', 'Access token signature invalid')
    }
    if (cause instanceof joseErrors.JWTInvalid || cause instanceof joseErrors.JWSInvalid) {
      throw new AuthError('TOKEN_MALFORMED', 'Access token malformed')
    }
    throw new AuthError('TOKEN_INVALID', 'Access token verification failed')
  }

  const parsed = accessTokenClaimsSchema.safeParse(payload)
  if (!parsed.success) {
    throw new AuthError(
      'TOKEN_CLAIMS_INVALID',
      `Access token claims invalid: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
    )
  }
  return parsed.data
}

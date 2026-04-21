import { createHash } from 'node:crypto'
import {
  type AccessTokenConfig,
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
} from '@jumix/auth'
import type { User } from '@jumix/db'
import type { RefreshTokenRepository, UserRepository } from './repositories'

export type RefreshTokenTtls = {
  webSeconds: number
  mobileSeconds: number
}

/**
 * CLAUDE.md §5.1: refresh TTL зависит от клиента — веб 30 дней, мобилка 90.
 * Пускать клиента самостоятельно выбирать TTL нельзя (можно злоупотребить,
 * выписав долгоживущий токен с web-клиента). Определяем по заголовкам и
 * объявленному `deviceKind` (с перепроверкой).
 */
export type ClientKind = 'web' | 'mobile'

export type IssuedTokens = {
  accessToken: string
  refreshToken: string
  refreshTokenId: string
  accessTokenExpiresAt: Date
  refreshTokenExpiresAt: Date
}

export type IssueTokensInput = {
  user: Pick<User, 'id' | 'role' | 'organizationId' | 'tokenVersion'>
  clientKind: ClientKind
  deviceId?: string | null
  ipAddress?: string | null
  userAgent?: string | null
}

/**
 * TokenIssuerService — выписывает пару access + refresh и записывает
 * refresh в БД (хэш, never plain-text). Вызывается:
 *   1. После успешного SMS-verify
 *   2. После успешного password login
 *   3. На refresh-ротации (выписывается новая пара, старый токен маркируется
 *      revoked=rotation, replaced_by=new_id — отдельный метод).
 */
export class TokenIssuerService {
  constructor(
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly users: UserRepository,
    private readonly jwtConfig: AccessTokenConfig,
    private readonly refreshTtls: RefreshTokenTtls,
  ) {}

  async issue(input: IssueTokensInput): Promise<IssuedTokens> {
    const now = new Date()
    const accessToken = await signAccessToken(
      {
        userId: input.user.id,
        organizationId: input.user.organizationId,
        role: input.user.role,
        tokenVersion: input.user.tokenVersion,
      },
      this.jwtConfig,
    )
    const accessTokenExpiresAt = new Date(now.getTime() + this.jwtConfig.ttlSeconds * 1000)

    const refresh = generateRefreshToken()
    const refreshTtlSeconds =
      input.clientKind === 'mobile' ? this.refreshTtls.mobileSeconds : this.refreshTtls.webSeconds
    const refreshTokenExpiresAt = new Date(now.getTime() + refreshTtlSeconds * 1000)

    const inserted = await this.refreshTokens.insert({
      userId: input.user.id,
      tokenHash: refresh.hash,
      deviceId: input.deviceId ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      expiresAt: refreshTokenExpiresAt,
    })

    await this.users.updateLastLogin(input.user.id, now)

    return {
      accessToken,
      refreshToken: refresh.token,
      refreshTokenId: inserted.id,
      accessTokenExpiresAt,
      refreshTokenExpiresAt,
    }
  }

  /**
   * Вспомогательный хеш для локальных сравнений (совпадает с packages/auth).
   * Экспорт оставим для handlers, которые получают raw-токен из тела запроса.
   */
  hashRefreshToken(raw: string): Buffer {
    return hashRefreshToken(raw)
  }

  /**
   * Вычисление refresh-hash без публичного импорта node:crypto в handlers —
   * дополнительная инкапсуляция для тестов и dev-логов.
   */
  static sha256Hex(input: string): string {
    return createHash('sha256').update(input).digest('hex')
  }
}

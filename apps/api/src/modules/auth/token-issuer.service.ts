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
    const prepared = await this.prepare(input)
    const inserted = await this.refreshTokens.insert(prepared.refreshInsert)
    await this.users.updateLastLogin(input.user.id, prepared.now)
    return prepared.build(inserted.id)
  }

  /**
   * Как `issue`, но INSERT нового refresh'а + revoke старого происходят
   * в одной транзакции с SELECT ... FOR UPDATE на старом токене. Защищает
   * от race condition при параллельных POST /auth/refresh (типично при
   * wake-from-background на мобильном клиенте).
   *
   * Возвращает `null` если старый токен уже отозван — caller обязан
   * отреагировать 401 INVALID_REFRESH. access-JWT генерируется заранее,
   * но наружу не возвращается в случае проигрыша race — stateless, нигде
   * не пишется в БД, утечки нет.
   */
  async issueAndRotate(
    input: IssueTokensInput,
    oldRefreshTokenId: string,
  ): Promise<IssuedTokens | null> {
    const prepared = await this.prepare(input)
    const inserted = await this.refreshTokens.rotateWithLock(
      oldRefreshTokenId,
      prepared.refreshInsert,
    )
    if (!inserted) return null
    await this.users.updateLastLogin(input.user.id, prepared.now)
    return prepared.build(inserted.id)
  }

  /**
   * Строит access-JWT и материалы refresh'а (plain + hash + expiresAt).
   * Не пишет в БД — caller решает, INSERT или rotateWithLock.
   */
  private async prepare(input: IssueTokensInput): Promise<{
    now: Date
    refreshInsert: {
      userId: string
      tokenHash: Buffer
      deviceId: string | null
      ipAddress: string | null
      userAgent: string | null
      expiresAt: Date
    }
    build: (refreshTokenId: string) => IssuedTokens
  }> {
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

    return {
      now,
      refreshInsert: {
        userId: input.user.id,
        tokenHash: refresh.hash,
        deviceId: input.deviceId ?? null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        expiresAt: refreshTokenExpiresAt,
      },
      build: (refreshTokenId) => ({
        accessToken,
        refreshToken: refresh.token,
        refreshTokenId,
        accessTokenExpiresAt,
        refreshTokenExpiresAt,
      }),
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

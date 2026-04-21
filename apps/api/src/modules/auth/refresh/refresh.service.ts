import { hashRefreshToken } from '@jumix/auth'
import type { FastifyBaseLogger } from 'fastify'
import { AppError } from '../../../lib/errors'
import type { AuthEventRepository, RefreshTokenRepository, UserRepository } from '../repositories'
import type { ClientKind, IssuedTokens, TokenIssuerService } from '../token-issuer.service'

export type RotateInput = {
  presentedToken: string
  clientKind: ClientKind
  deviceId: string | null
  ipAddress: string
  userAgent: string | null
}

export type LogoutInput = {
  presentedToken: string
  ipAddress: string
  userAgent: string | null
}

export type LogoutAllInput = {
  userId: string
  ipAddress: string
  userAgent: string | null
}

/**
 * RefreshAuthService — реализует CLAUDE.md §5.1 refresh-rotation:
 *
 *   1. Rotate on every use: старый refresh → revoked=rotation, replaced_by=new.
 *   2. Reuse detection: если клиент предъявил уже-rotated токен, это индикатор
 *      что кто-то скопировал токен; reply 401 + revoke всей цепочки (по
 *      replaced_by) + incrementTokenVersion (обесценивает активные access).
 *   3. Logout: revoke текущего refresh (idempotent).
 *   4. Logout-all: revokeAllForUser + incrementTokenVersion.
 *
 * Unified error: `INVALID_REFRESH` для любого failure (не раскрываем — was it
 * not-found / expired / revoked / org-suspended). Конкретная причина — в audit.
 */
export class RefreshAuthService {
  constructor(
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly users: UserRepository,
    private readonly authEvents: AuthEventRepository,
    private readonly tokenIssuer: TokenIssuerService,
    private readonly log: FastifyBaseLogger,
  ) {}

  async rotate(input: RotateInput): Promise<IssuedTokens> {
    const { presentedToken, clientKind, deviceId, ipAddress, userAgent } = input

    const hash = hashRefreshToken(presentedToken)
    const record = await this.refreshTokens.findByHash(hash)

    if (!record) {
      await this.logRefreshFail(null, null, ipAddress, userAgent, 'not_found')
      throw this.invalidRefresh()
    }

    // REUSE DETECTION: presented token'у уже выписан наследник (rotation).
    // Значит кто-то держит копию legacy-токена и пытается его использовать
    // повторно — breach. Revoke всю цепочку + bump tokenVersion (access
    // токены, происходящие от любого звена, сразу невалидны).
    if (record.revokedReason === 'rotation') {
      await this.refreshTokens.revokeChainFrom(record.id)
      await this.users.incrementTokenVersion(record.userId)
      await this.authEvents.log({
        userId: record.userId,
        eventType: 'refresh_reuse_detected',
        phone: null,
        ipAddress,
        userAgent,
        success: false,
        failureReason: 'chain_revoked',
        metadata: { tokenId: record.id },
      })
      this.log.warn(
        { userId: record.userId, tokenId: record.id },
        'refresh token reuse detected — chain revoked',
      )
      throw this.invalidRefresh()
    }

    if (record.revokedAt) {
      // logout / admin_revoke / logout_all — обычное отказное
      await this.logRefreshFail(
        record.userId,
        null,
        ipAddress,
        userAgent,
        `revoked:${record.revokedReason ?? 'unknown'}`,
      )
      throw this.invalidRefresh()
    }

    if (record.expiresAt.getTime() <= Date.now()) {
      await this.logRefreshFail(record.userId, null, ipAddress, userAgent, 'expired')
      throw this.invalidRefresh()
    }

    // Грузим user с organization.status одним round-trip'ом.
    const user = await this.users.findByIdWithOrganization(record.userId)
    if (!user || user.deletedAt) {
      await this.logRefreshFail(record.userId, null, ipAddress, userAgent, 'user_deleted')
      throw this.invalidRefresh()
    }
    if (user.status !== 'active') {
      await this.logRefreshFail(record.userId, user.phone, ipAddress, userAgent, 'user_blocked')
      throw this.invalidRefresh()
    }
    // non-superadmin ролям нужна активная организация
    if (user.role !== 'superadmin' && user.organizationStatus !== 'active') {
      await this.logRefreshFail(record.userId, user.phone, ipAddress, userAgent, 'org_inactive')
      throw this.invalidRefresh()
    }

    // Выписываем новую пару и маркируем старую ротированной.
    const newTokens = await this.tokenIssuer.issue({
      user,
      clientKind,
      deviceId,
      ipAddress,
      userAgent,
    })
    await this.refreshTokens.revoke(record.id, 'rotation', newTokens.refreshTokenId)

    await this.authEvents.log({
      userId: user.id,
      eventType: 'refresh_used',
      phone: user.phone,
      ipAddress,
      userAgent,
      success: true,
      failureReason: null,
      metadata: { oldTokenId: record.id, newTokenId: newTokens.refreshTokenId },
    })

    return newTokens
  }

  /**
   * Idempotent: неизвестный / уже revoked токен → silent 200.
   * Так clients могут вызывать logout на app close без обработки ошибок.
   */
  async logout(input: LogoutInput): Promise<void> {
    const { presentedToken, ipAddress, userAgent } = input

    const hash = hashRefreshToken(presentedToken)
    const record = await this.refreshTokens.findByHash(hash)
    if (!record || record.revokedAt) {
      return
    }

    await this.refreshTokens.revoke(record.id, 'logout')
    await this.authEvents.log({
      userId: record.userId,
      eventType: 'logout',
      phone: null,
      ipAddress,
      userAgent,
      success: true,
      failureReason: null,
      metadata: { tokenId: record.id },
    })
  }

  /**
   * Полный sign-out: все активные refresh → revoked, tokenVersion bump →
   * все активные access перестают валидироваться на ближайшем запросе.
   */
  async logoutAll(input: LogoutAllInput): Promise<void> {
    await this.refreshTokens.revokeAllForUser(input.userId, 'logout_all')
    await this.users.incrementTokenVersion(input.userId)
    await this.authEvents.log({
      userId: input.userId,
      eventType: 'logout_all',
      phone: null,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      success: true,
      failureReason: null,
      metadata: {},
    })
  }

  private async logRefreshFail(
    userId: string | null,
    phone: string | null,
    ipAddress: string,
    userAgent: string | null,
    reason: string,
  ): Promise<void> {
    await this.authEvents.log({
      userId,
      eventType: 'refresh_used',
      phone,
      ipAddress,
      userAgent,
      success: false,
      failureReason: reason,
      metadata: {},
    })
  }

  private invalidRefresh(): AppError {
    return new AppError({
      statusCode: 401,
      code: 'INVALID_REFRESH',
      message: 'Refresh token is invalid or expired',
    })
  }
}

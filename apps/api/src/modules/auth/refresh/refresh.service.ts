import { type MemoryRateLimiter, type RateLimiter, hashRefreshToken } from '@jumix/auth'
import type { RefreshToken } from '@jumix/db'
import type { FastifyBaseLogger } from 'fastify'
import { AppError } from '../../../lib/errors'
import type { AuthEventRepository, RefreshTokenRepository, UserRepository } from '../repositories'
import type { ClientKind, IssuedTokens, TokenIssuerService } from '../token-issuer.service'

/**
 * Grace-window для distinction легитимной race-condition от реального reuse.
 *
 * Без окна любой concurrent refresh на мобилке (wake-from-background часто
 * запускает несколько запросов одновременно) ломает всю цепочку: loser видит
 * revokedReason='rotation' снаружи TX после commit'а winner'а, триггерит
 * reuse-detection, revoke'ит и новый токен → пользователь получает полный
 * logout на ровном месте.
 *
 * 10 секунд покрывают:
 *   - Обычный wake-from-background race (миллисекунды)
 *   - Медленный 3G на стройке (retry с backoff 1+2+4 сек)
 *   - Сетевые задержки между регионами
 *
 * Если request прилетел в пределах окна И все identity-сигналы совпадают с
 * winner'ом (IP / UA / deviceId) — считаем race и просто отвечаем 401
 * INVALID_REFRESH. Если сигналы не совпадают — эскалируем до полного
 * reuse-detection, потому что атакующий с украденным токеном мог попасть
 * в окно, но его UA/deviceId/IP отличается.
 */
const RACE_WINDOW_MS = 10_000

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
 * Rate limits на /auth/refresh. IP-лимит первым — отсекает спам до любого
 * обращения к БД (SELECT по hash дешёвый, но всё равно writeable I/O).
 * User-лимит — после идентификации, защищает от застрявшего клиента или
 * утечки refresh'а (10/мин достаточно для любого нормального wake+refresh
 * цикла на мобилке).
 */
export type RefreshRateLimiters = {
  perUserPerMinute: RateLimiter | MemoryRateLimiter
  perIpPerHour: RateLimiter | MemoryRateLimiter
}

/**
 * RefreshAuthService — реализует CLAUDE.md §5.1 refresh-rotation:
 *
 *   1. Rotate on every use: старый refresh → revoked=rotation, replaced_by=new.
 *      Атомарно через `tokenIssuer.issueAndRotate` (SELECT FOR UPDATE +
 *      INSERT + UPDATE в одной транзакции) — защита от race при двойном
 *      refresh с одним токеном.
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
    private readonly limiters: RefreshRateLimiters,
    private readonly log: FastifyBaseLogger,
  ) {}

  async rotate(input: RotateInput): Promise<IssuedTokens> {
    const { presentedToken, clientKind, deviceId, ipAddress, userAgent } = input

    // 1) Per-IP limit FIRST — до любой БД-работы. Защита от спама без
    //    знания user-identity.
    const ipCheck = await this.limiters.perIpPerHour.check(`refresh:ip:${ipAddress}`)
    if (!ipCheck.allowed) {
      await this.logRefreshFail(null, null, ipAddress, userAgent, 'rate_limited_ip')
      throw this.rateLimited(ipCheck.retryAfterMs ?? null)
    }

    const hash = hashRefreshToken(presentedToken)
    const record = await this.refreshTokens.findByHash(hash)

    if (!record) {
      await this.logRefreshFail(null, null, ipAddress, userAgent, 'not_found')
      throw this.invalidRefresh()
    }

    // ROTATION выставлен на старом токене — presented либо легитимный race
    // (concurrent wake-from-background), либо реальный reuse (украденный
    // токен предъявлен после легитимной ротации). Различаем по окну
    // `RACE_WINDOW_MS` + сравнению identity с winner'ом.
    if (record.revokedReason === 'rotation') {
      const elapsedMs = record.revokedAt
        ? Date.now() - record.revokedAt.getTime()
        : Number.POSITIVE_INFINITY

      if (elapsedMs < RACE_WINDOW_MS) {
        const risk = await this.computeRotationRaceRisk(record, { ipAddress, userAgent, deviceId })

        if (risk.score === 0) {
          // Чистый race: тот же клиент отправил два запроса, проиграл второй.
          // Просто отказываем — цепочка валидна, winner уже выписал новую пару.
          await this.authEvents.log({
            userId: record.userId,
            eventType: 'refresh_rotation_race',
            phone: null,
            ipAddress,
            userAgent,
            success: false,
            failureReason: 'rotation_race',
            metadata: {
              tokenId: record.id,
              replacedBy: record.replacedBy,
              elapsedMs,
              signals: risk.details,
            },
          })
          throw this.invalidRefresh()
        }

        this.log.warn(
          { userId: record.userId, tokenId: record.id, elapsedMs, signals: risk.details },
          'rotation race window hit, but identity signals mismatch — escalating to reuse detection',
        )
        // fall through к reuse-detection ниже
      }

      // REUSE DETECTION: окно истекло ИЛИ identity-сигналы не сошлись.
      // Безопасная сторона — revoke всю цепочку + bump tokenVersion.
      const chainLength = await this.refreshTokens.revokeChainFrom(record.id)
      await this.users.incrementTokenVersion(record.userId)
      await this.authEvents.log({
        userId: record.userId,
        eventType: 'refresh_reuse_detected',
        phone: null,
        ipAddress,
        userAgent,
        success: false,
        failureReason: 'chain_revoked',
        metadata: {
          tokenId: record.id,
          chainLengthRevoked: chainLength,
          originallyIssuedAt: record.createdAt.toISOString(),
          originalIpAddress: record.ipAddress,
          originalUserAgent: record.userAgent,
          originalDeviceId: record.deviceId,
          elapsedSinceRevokeMs: Number.isFinite(elapsedMs) ? elapsedMs : null,
        },
      })
      this.log.warn(
        { userId: record.userId, tokenId: record.id, chainLength },
        'refresh token reuse detected — chain revoked',
      )
      throw this.invalidRefresh()
    }

    // 2) Per-user limit — после идентификации, до тяжёлой работы.
    const userCheck = await this.limiters.perUserPerMinute.check(`refresh:user:${record.userId}`)
    if (!userCheck.allowed) {
      await this.logRefreshFail(record.userId, null, ipAddress, userAgent, 'rate_limited_user')
      throw this.rateLimited(userCheck.retryAfterMs ?? null)
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

    // Атомарная ротация: INSERT нового + revoke старого в одной tx
    // с SELECT ... FOR UPDATE. Null = проиграли race с параллельным
    // запросом, который успел отроtировать этот же токен первым.
    const newTokens = await this.tokenIssuer.issueAndRotate(
      { user, clientKind, deviceId, ipAddress, userAgent },
      record.id,
    )
    if (!newTokens) {
      await this.logRefreshFail(record.userId, user.phone, ipAddress, userAgent, 'race_lost')
      throw this.invalidRefresh()
    }

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

  /**
   * Сравнивает identity-контекст presented-запроса с winner'ом ротации.
   * Возвращает score: 0 = те же IP/UA/deviceId (чистый race), >0 = расхождение
   * (подозрительно, эскалируем до reuse).
   *
   * Веса:
   *   - ipAddress: 0.3 (мобильные IP плавают — LTE↔Wi-Fi, не решающий без
   *     GeoIP; см. backlog «enhanced race detection»)
   *   - userAgent: 1.0 (в пределах сессии не меняется, расхождение = другой клиент)
   *   - deviceId:  2.0 (самый сильный сигнал, разный deviceId = разные устройства)
   *
   * Пороговое значение для caller'а — строго `score === 0`: любое ненулевое
   * значение триггерит reuse. Консервативно: лучше false-positive logout,
   * чем пропущенный breach.
   */
  private async computeRotationRaceRisk(
    oldRecord: RefreshToken,
    input: { ipAddress: string; userAgent: string | null; deviceId: string | null },
  ): Promise<{ score: number; details: Record<string, unknown> }> {
    if (!oldRecord.replacedBy) {
      return { score: 1, details: { reason: 'no_replaced_by' } }
    }

    const winner = await this.refreshTokens.findById(oldRecord.replacedBy)
    if (!winner) {
      return { score: 1, details: { reason: 'winner_not_found' } }
    }

    const details: Record<string, unknown> = {}
    let score = 0

    if (winner.ipAddress && winner.ipAddress !== input.ipAddress) {
      details.ipChanged = { winner: winner.ipAddress, loser: input.ipAddress }
      score += 0.3
    }
    if (winner.userAgent && input.userAgent && winner.userAgent !== input.userAgent) {
      details.userAgentChanged = {
        winner: winner.userAgent.substring(0, 100),
        loser: input.userAgent.substring(0, 100),
      }
      score += 1.0
    }
    if (winner.deviceId && input.deviceId && winner.deviceId !== input.deviceId) {
      details.deviceIdChanged = { winner: winner.deviceId, loser: input.deviceId }
      score += 2.0
    }

    return { score, details }
  }

  private rateLimited(retryAfterMs: number | null): AppError {
    return new AppError({
      statusCode: 429,
      code: 'RATE_LIMITED',
      message: 'Too many refresh attempts',
      details: { retryAfterMs },
    })
  }
}

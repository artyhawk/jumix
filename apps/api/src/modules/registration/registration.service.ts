import type { CraneProfile, DatabaseClient, User } from '@jumix/db'
import { auditLog, craneProfiles, users } from '@jumix/db'
import { maskPhone } from '@jumix/shared'
import type { FastifyBaseLogger } from 'fastify'
import { AppError } from '../../lib/errors'
import type { AuthEventRepository, UserRepository } from '../auth/repositories'
import type { SmsAuthService } from '../auth/sms/sms.service'
import type { ClientKind, IssuedTokens, TokenIssuerService } from '../auth/token-issuer.service'
import type { StartRegistrationInput, VerifyRegistrationInput } from './registration.schemas'

/**
 * RegistrationService — public SMS-based signup flow для крановщиков (ADR 0004).
 *
 * Тонкий orchestration-слой поверх существующего `SmsAuthService` +
 * `TokenIssuerService`: OTP, rate-limit, audit по SMS — всё уже есть в
 * auth-модуле. Здесь только:
 *   - start: делегирование в `sms.requestCode` (тот же OTP store, те же лимиты).
 *   - verify: `sms.verifyCode` → pre-check phone+ИИН → транзакционный INSERT
 *     users + crane_profiles + audit_log{action:'registration.complete'} →
 *     `tokenIssuer.issue` (вне транзакции — чтобы refresh hash не откатился
 *     при крайне маловероятной ошибке write-after-commit; поведение зеркалит
 *     sms.routes.ts login flow).
 *
 * Инварианты:
 *   - user создаётся с role=`operator`, organizationId=null. Migration 0008
 *     ослабила `users_org_role_consistency_chk` под этот случай.
 *   - crane_profile создаётся с approvalStatus=`pending` (default из схемы).
 *     ADR 0003 pipeline 1: superadmin апрувит отдельно.
 *   - 409 PHONE_ALREADY_REGISTERED / 409 IIN_ALREADY_EXISTS — pre-checks;
 *     PG 23505 на unique-индексе (race) ловится и мапится в те же 409.
 *   - OTP-код не логируется, в metadata только masked phone + ids.
 */

const PG_UNIQUE_VIOLATION = '23505'

function isPgUniqueViolation(err: unknown): err is { code: string; constraint_name?: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === PG_UNIQUE_VIOLATION
  )
}

export type RegistrationMeta = {
  ipAddress: string
  userAgent: string | null
}

export type StartRegistrationResult = {
  /** Сколько секунд живёт выданный OTP. */
  expiresIn: number
}

export type VerifyRegistrationResult = {
  tokens: IssuedTokens
  user: User
  craneProfile: CraneProfile
}

/** 5 минут. Совпадает с SMS_CODE_TTL_SECONDS в sms.service.ts. */
export const REGISTRATION_OTP_TTL_SECONDS = 5 * 60

export class RegistrationService {
  constructor(
    private readonly database: DatabaseClient,
    private readonly sms: SmsAuthService,
    private readonly tokenIssuer: TokenIssuerService,
    private readonly userRepo: UserRepository,
    private readonly authEvents: AuthEventRepository,
    private readonly logger: FastifyBaseLogger,
  ) {}

  /**
   * POST /api/v1/registration/start.
   *
   * Делегирует в `sms.requestCode` — он сам разруливает rate-limit, генерирует
   * OTP, пишет в Redis, вызывает SMS-провайдер, аудитит `sms_requested`.
   * Здесь дополнительно — `registration.start` audit-entry для отделения
   * регистрационной трассы от login-трассы в аналитике.
   *
   * Не раскрываем существует ли пользователь: SMS отправляется для любого
   * валидного KZ-номера. Попытка зарегистрироваться с существующим phone
   * обнаруживается только на verify-шаге (409).
   */
  async start(
    input: StartRegistrationInput,
    meta: RegistrationMeta,
  ): Promise<StartRegistrationResult> {
    // `sms.requestCode` бросает AppError для rate-limit / delivery-failed;
    // дальше поднимется в error-handler как есть.
    await this.sms.requestCode(input.phone, meta.ipAddress, meta.userAgent)

    await this.database.db.insert(auditLog).values({
      actorUserId: null,
      actorRole: null,
      action: 'registration.start',
      targetType: null,
      targetId: null,
      organizationId: null,
      metadata: {
        phone: maskPhone(input.phone),
      },
      ipAddress: meta.ipAddress,
    })

    return { expiresIn: REGISTRATION_OTP_TTL_SECONDS }
  }

  /**
   * POST /api/v1/registration/verify.
   *
   * Контракт verify:
   *   1. `sms.verifyCode` — constant-time OTP check, attempts limit, audit
   *      `sms_verified`/`sms_verify_failed`.
   *   2. Если код верный, но пользователь УЖЕ существует (isExisting=true) —
   *      409 PHONE_ALREADY_REGISTERED. sms.verifyCode в этом случае возвращает
   *      userId, но для registration это конфликт: код потрачен, запись уже есть.
   *   3. Pre-check ИИН (глобально, через crane_profiles — identity pool).
   *   4. Транзакция: INSERT user → INSERT crane_profile → INSERT audit_log.
   *   5. Вне транзакции: `tokenIssuer.issue` (вписывает refresh в БД).
   */
  async verify(
    input: VerifyRegistrationInput,
    meta: RegistrationMeta & { clientKind: ClientKind; deviceId: string | null },
  ): Promise<VerifyRegistrationResult> {
    // 1. OTP verify — делегируем в SmsAuthService. Он сам пишет sms_verified
    //    audit и удаляет код при успехе / exhaust'е.
    const verify = await this.sms.verifyCode(input.phone, input.otp, meta.ipAddress, meta.userAgent)

    // 2. Existing user → 409. `sms.verifyCode` в этой ветке ВЕРНЁТ userId, но
    //    для registration это коллизия: OTP сожжён, создавать нового юзера
    //    нельзя (users_phone_key partial unique всё равно упадёт), а выдавать
    //    токены как login — тоже нет (у нас нет password context и клиент
    //    ждёт registration DTO). Чистый 409 — клиент отправит на /auth/sms/.
    if (verify.isExisting) {
      throw this.phoneAlreadyRegistered()
    }

    // 3. Pre-check ИИН (identity pool — crane_profiles global UNIQUE среди
    //    живых). Race до INSERT'а страхует partial unique индекс.
    const iinConflictBefore = await this.findCraneProfileByIin(input.iin)
    if (iinConflictBefore) {
      await this.authEvents.log({
        userId: null,
        eventType: 'sms_verified',
        phone: input.phone,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        success: false,
        failureReason: 'iin_already_exists',
        metadata: {},
      })
      throw this.iinAlreadyExists()
    }

    // 4. Транзакция: user + crane_profile + audit_log одной атомарной единицей.
    let created: { user: User; craneProfile: CraneProfile }
    try {
      created = await this.database.db.transaction(async (tx) => {
        const [userRow] = await tx
          .insert(users)
          .values({
            phone: input.phone,
            role: 'operator',
            organizationId: null,
            name: [input.firstName, input.lastName].filter(Boolean).join(' ').trim(),
            status: 'active',
          })
          .returning()

        if (!userRow) {
          throw new Error('INSERT users returned no row — should not happen')
        }

        const [profileRow] = await tx
          .insert(craneProfiles)
          .values({
            userId: userRow.id,
            firstName: input.firstName,
            lastName: input.lastName,
            patronymic: input.patronymic ?? null,
            iin: input.iin,
            specialization: input.specialization ?? {},
            // approvalStatus default 'pending' — не указываем явно.
          })
          .returning()

        if (!profileRow) {
          throw new Error('INSERT crane_profiles returned no row — should not happen')
        }

        await tx.insert(auditLog).values({
          actorUserId: userRow.id,
          actorRole: 'operator',
          action: 'registration.complete',
          targetType: 'crane_profile',
          targetId: profileRow.id,
          organizationId: null,
          metadata: {
            phone: maskPhone(input.phone),
            craneProfileId: profileRow.id,
            userId: userRow.id,
          },
          ipAddress: meta.ipAddress,
        })

        return {
          user: userRow,
          craneProfile: {
            id: profileRow.id,
            userId: profileRow.userId,
            firstName: profileRow.firstName,
            lastName: profileRow.lastName,
            patronymic: profileRow.patronymic,
            iin: profileRow.iin,
            avatarKey: profileRow.avatarKey,
            specialization: (profileRow.specialization ?? {}) as Record<string, unknown>,
            approvalStatus: profileRow.approvalStatus,
            approvedByUserId: profileRow.approvedByUserId,
            approvedAt: profileRow.approvedAt,
            rejectedByUserId: profileRow.rejectedByUserId,
            rejectedAt: profileRow.rejectedAt,
            rejectionReason: profileRow.rejectionReason,
            licenseKey: profileRow.licenseKey,
            licenseExpiresAt: profileRow.licenseExpiresAt
              ? profileRow.licenseExpiresAt instanceof Date
                ? profileRow.licenseExpiresAt
                : new Date(profileRow.licenseExpiresAt)
              : null,
            licenseVersion: profileRow.licenseVersion,
            licenseWarning30dSentAt: profileRow.licenseWarning30dSentAt,
            licenseWarning7dSentAt: profileRow.licenseWarning7dSentAt,
            licenseExpiredAt: profileRow.licenseExpiredAt,
            deletedAt: profileRow.deletedAt,
            createdAt: profileRow.createdAt,
            updatedAt: profileRow.updatedAt,
          },
        }
      })
    } catch (err) {
      if (isPgUniqueViolation(err)) {
        if (err.constraint_name === 'users_phone_key') {
          throw this.phoneAlreadyRegistered()
        }
        if (err.constraint_name === 'crane_profiles_iin_unique_active_idx') {
          throw this.iinAlreadyExists()
        }
      }
      this.logger.error({ err }, 'registration verify transaction failed')
      throw err
    }

    // 5. Выпускаем токены. `issue` дополнительно обновляет users.last_login_at.
    const tokens = await this.tokenIssuer.issue({
      user: created.user,
      clientKind: meta.clientKind,
      deviceId: meta.deviceId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    })

    await this.authEvents.log({
      userId: created.user.id,
      eventType: 'login_success',
      phone: input.phone,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      success: true,
      failureReason: null,
      metadata: { method: 'registration' },
    })

    return { tokens, user: created.user, craneProfile: created.craneProfile }
  }

  private async findCraneProfileByIin(iin: string): Promise<{ id: string } | null> {
    // Inline SELECT — не тянем CraneProfileRepository (он требует AuthContext,
    // а в public-flow его нет). Same partial-unique scope: deleted_at IS NULL.
    const { and, eq, isNull } = await import('drizzle-orm')
    const rows = await this.database.db
      .select({ id: craneProfiles.id })
      .from(craneProfiles)
      .where(and(eq(craneProfiles.iin, iin), isNull(craneProfiles.deletedAt)))
      .limit(1)
    return rows[0] ?? null
  }

  private phoneAlreadyRegistered(): AppError {
    return new AppError({
      statusCode: 409,
      code: 'PHONE_ALREADY_REGISTERED',
      message: 'This phone is already registered. Use login flow.',
    })
  }

  private iinAlreadyExists(): AppError {
    return new AppError({
      statusCode: 409,
      code: 'IIN_ALREADY_EXISTS',
      message: 'Another crane profile with this IIN already exists',
    })
  }
}

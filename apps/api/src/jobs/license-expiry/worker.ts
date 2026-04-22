import { type DatabaseClient, auditLog, craneProfiles } from '@jumix/db'
import { and, eq, isNotNull, isNull, lte, or } from 'drizzle-orm'
import type { FastifyBaseLogger } from 'fastify'

/**
 * License-expiry worker (ADR 0005 §/cron).
 *
 * Раз в сутки (02:00 Asia/Almaty) сканирует `crane_profiles`, у которых
 * `license_expires_at IS NOT NULL AND deleted_at IS NULL`, и для каждого
 * решает, надо ли отправить предупреждение:
 *
 *   - `expired_at IS NULL AND now >= expires_at`               → expired notice
 *   - `warning_7d_sent_at IS NULL AND expires_at <= now+7d`   → 7d warning
 *   - `warning_30d_sent_at IS NULL AND expires_at <= now+30d` → 30d warning
 *
 * Приоритет обработки — ОТ ХУДШЕГО: если запись одновременно удовлетворяет
 * expired и 7d, посылаем expired (higher-priority) и пропускаем 7d — даже если
 * 30d раньше не отправлялся (мы «проспали» окно, новый документ обнулит
 * `warning_*_sent_at`). Логика — «latest meaningful notification», не
 * «серия warnings».
 *
 * Audit-invariant: сам UPDATE и вставка audit-row идут в одной транзакции.
 * Action = 'license.warning_sent', metadata содержит вариант (30d/7d/expired)
 * и дату expires_at — чтобы оффлайн-аналитика могла реконструировать линию
 * по одному WHERE.
 *
 * Worker НЕ отправляет сам push/SMS — то в слое notifications (отложено в
 * backlog). На этом этапе достаточно audit-трейла: UI оператора видит красный
 * бейдж через licenseStatus уже сейчас.
 */

export type WarningVariant = '30d' | '7d' | 'expired'

export interface LicenseExpiryRunResult {
  scanned: number
  processed: number
  warningsSent: Record<WarningVariant, number>
}

type CandidateRow = {
  id: string
  licenseExpiresAt: Date
  licenseWarning30dSentAt: Date | null
  licenseWarning7dSentAt: Date | null
  licenseExpiredAt: Date | null
}

export class LicenseExpiryWorker {
  constructor(
    private readonly database: DatabaseClient,
    private readonly logger: FastifyBaseLogger,
  ) {}

  async process(now: Date = new Date()): Promise<LicenseExpiryRunResult> {
    const thirtyDaysAhead = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)

    const rows = (await this.database.db
      .select({
        id: craneProfiles.id,
        licenseExpiresAt: craneProfiles.licenseExpiresAt,
        licenseWarning30dSentAt: craneProfiles.licenseWarning30dSentAt,
        licenseWarning7dSentAt: craneProfiles.licenseWarning7dSentAt,
        licenseExpiredAt: craneProfiles.licenseExpiredAt,
      })
      .from(craneProfiles)
      .where(
        and(
          isNull(craneProfiles.deletedAt),
          isNotNull(craneProfiles.licenseExpiresAt),
          lte(craneProfiles.licenseExpiresAt, thirtyDaysAhead),
          or(
            isNull(craneProfiles.licenseWarning30dSentAt),
            isNull(craneProfiles.licenseWarning7dSentAt),
            isNull(craneProfiles.licenseExpiredAt),
          ),
        ),
      )) as CandidateRow[]

    const result: LicenseExpiryRunResult = {
      scanned: rows.length,
      processed: 0,
      warningsSent: { '30d': 0, '7d': 0, expired: 0 },
    }

    for (const row of rows) {
      const variant = determineWarning(row, now)
      if (!variant) continue
      await this.sendWarning(row.id, variant, row.licenseExpiresAt, now)
      result.processed++
      result.warningsSent[variant]++
    }

    this.logger.info(
      {
        scanned: result.scanned,
        processed: result.processed,
        warningsSent: result.warningsSent,
      },
      'license-expiry scan complete',
    )
    return result
  }

  private async sendWarning(
    craneProfileId: string,
    variant: WarningVariant,
    expiresAt: Date,
    now: Date,
  ): Promise<void> {
    await this.database.db.transaction(async (tx) => {
      // Optimistic guard: если между SELECT и UPDATE другой worker уже проставил
      // флаг — пропускаем (WHERE ... IS NULL не совпадёт, returning() пусто).
      const set =
        variant === '30d'
          ? { licenseWarning30dSentAt: now, updatedAt: now }
          : variant === '7d'
            ? { licenseWarning7dSentAt: now, updatedAt: now }
            : { licenseExpiredAt: now, updatedAt: now }

      const nullCheck =
        variant === '30d'
          ? isNull(craneProfiles.licenseWarning30dSentAt)
          : variant === '7d'
            ? isNull(craneProfiles.licenseWarning7dSentAt)
            : isNull(craneProfiles.licenseExpiredAt)

      const rows = await tx
        .update(craneProfiles)
        .set(set)
        .where(
          and(eq(craneProfiles.id, craneProfileId), isNull(craneProfiles.deletedAt), nullCheck),
        )
        .returning({ id: craneProfiles.id })

      if (rows.length === 0) {
        this.logger.debug(
          { craneProfileId, variant },
          'license-expiry warning skipped (flag already set)',
        )
        return
      }

      await tx.insert(auditLog).values({
        actorUserId: null,
        actorRole: 'system',
        action: 'license.warning_sent',
        targetType: 'crane_profile',
        targetId: craneProfileId,
        metadata: { variant, expiresAt: expiresAt.toISOString() },
        ipAddress: null,
      })
    })
  }
}

/**
 * Решает, какой warning (если вообще) отправлять — учитывая уже отправленные.
 * Приоритет expired > 7d > 30d: если сразу попали в critical-окно,
 * пропускаем все младшие варианты, чтобы не спамить mobile за одну ночь.
 */
export function determineWarning(row: CandidateRow, now: Date): WarningVariant | null {
  const msRemaining = row.licenseExpiresAt.getTime() - now.getTime()
  if (msRemaining <= 0 && row.licenseExpiredAt === null) return 'expired'
  if (msRemaining <= 7 * 24 * 60 * 60 * 1000 && row.licenseWarning7dSentAt === null) return '7d'
  if (msRemaining <= 30 * 24 * 60 * 60 * 1000 && row.licenseWarning30dSentAt === null) return '30d'
  return null
}

/**
 * License status — computed на boundary (DTO / canWork gate) из
 * (licenseExpiresAt, now). В БД не хранится: значение меняется само собой по
 * мере прохождения времени, а daily UPDATE всех rows ради status-а — оверкилл.
 *
 * Градации (ADR 0005, соответствуют ТЗ §5.1.5.1):
 *   - `missing`            документ не загружен (licenseExpiresAt IS NULL)
 *   - `valid`              до expiry больше 30 дней
 *   - `expiring_soon`      30d ≥ осталось > 7d — пора готовить замену
 *   - `expiring_critical`  7d ≥ осталось > 0  — последнее предупреждение
 *   - `expired`            expiry прошёл — работа заблокирована
 *
 * Все значения кроме `missing` и `expired` считаются «рабочими» — ТЗ требует
 * блокировать только при полном expiry, предупреждающие градации UI
 * использует для цвета/бейджа.
 */

export const LICENSE_STATUSES = [
  'missing',
  'valid',
  'expiring_soon',
  'expiring_critical',
  'expired',
] as const
export type LicenseStatus = (typeof LICENSE_STATUSES)[number]

const MS_PER_DAY = 24 * 60 * 60 * 1000

export function computeLicenseStatus(expiresAt: Date | null, now: Date): LicenseStatus {
  if (!expiresAt) return 'missing'
  const msRemaining = expiresAt.getTime() - now.getTime()
  if (msRemaining <= 0) return 'expired'
  if (msRemaining <= 7 * MS_PER_DAY) return 'expiring_critical'
  if (msRemaining <= 30 * MS_PER_DAY) return 'expiring_soon'
  return 'valid'
}

/**
 * canWork gate для license: ТЗ §5.1.5.1 блокирует работу только при expired
 * или missing. `expiring_*` предупреждает, но не останавливает.
 */
export function isLicenseValidForWork(status: LicenseStatus): boolean {
  return status !== 'missing' && status !== 'expired'
}

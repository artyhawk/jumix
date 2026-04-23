import type { ApprovalStatus, LicenseStatus, OperatorHireStatus } from '@jumix/shared'

/**
 * Single-source label dictionaries для всех display-контекстов в mobile app.
 * Русские строки; при локализации (KZ) — разветвить через i18n (backlog).
 */
export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  pending: 'На рассмотрении',
  approved: 'Одобрено',
  rejected: 'Отклонено',
}

export const APPROVAL_STATUS_LABELS_PROFILE: Record<ApprovalStatus, string> = {
  pending: 'Ожидает одобрения',
  approved: 'Профиль одобрен',
  rejected: 'Профиль отклонён',
}

export const HIRE_STATUS_LABELS: Record<OperatorHireStatus, string> = {
  active: 'Активен',
  blocked: 'Приостановлен',
  terminated: 'Уволен',
}

export const LICENSE_STATUS_LABELS: Record<LicenseStatus, string> = {
  missing: 'Не загружено',
  valid: 'Действует',
  expiring_soon: 'Истекает скоро',
  expiring_critical: 'Истекает критично',
  expired: 'Просрочено',
}

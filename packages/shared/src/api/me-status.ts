/**
 * Cross-app types для operator /me/status endpoint. Используются и веб-
 * кабинетом (apps/web), и мобилкой (apps/mobile). Hoisted из web (B3-UI-4)
 * как подготовка к M2 — mobile operator landing screen переиспользует
 * тот же контракт.
 *
 * Когда появится сгенерированный OpenAPI — заменить на импорт из
 * `@jumix/api-types`; пока руками sync'им с backend response shape.
 */

export type ApprovalStatus = 'pending' | 'approved' | 'rejected'

export type LicenseStatus = 'missing' | 'valid' | 'expiring_soon' | 'expiring_critical' | 'expired'

export type OperatorHireStatus = 'active' | 'blocked' | 'terminated'

export interface CraneProfile {
  id: string
  userId: string
  firstName: string
  lastName: string
  patronymic: string | null
  iin: string
  phone: string
  avatarUrl: string | null
  approvalStatus: ApprovalStatus
  rejectionReason: string | null
  approvedAt: string | null
  rejectedAt: string | null
  licenseStatus: LicenseStatus
  licenseExpiresAt: string | null
  licenseUrl: string | null
  licenseVersion?: number
  createdAt: string
  updatedAt: string
}

export interface MeStatusMembership {
  id: string
  organizationId: string
  organizationName: string
  approvalStatus: ApprovalStatus
  status: OperatorHireStatus
  hiredAt: string | null
  approvedAt: string | null
  rejectedAt: string | null
  terminatedAt: string | null
  rejectionReason: string | null
}

/**
 * GET /api/v1/crane-profiles/me/status — single source-of-truth
 * для operator UI routing (web + mobile).
 *
 * - `profile`: полный DTO (как `GET /me`) + phone + license поля.
 * - `memberships`: все hire-записи (approved + pending + rejected + terminated).
 * - `canWork`: совокупный gate — profile approved AND ≥1 active hire AND
 *   license valid-for-work (см. CLAUDE.md rule #15).
 * - `canWorkReasons`: пустой массив когда canWork=true; иначе — human-readable
 *   blocking reasons, Russian, показываются пользователю как чек-лист.
 */
export interface MeStatusResponse {
  profile: CraneProfile
  memberships: MeStatusMembership[]
  licenseStatus: LicenseStatus
  canWork: boolean
  canWorkReasons: string[]
}

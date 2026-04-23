/**
 * Типы, отзеркаливающие backend-контракты. Обновлять руками при изменении API;
 * когда появится сгенерированный OpenAPI — заменить на импорт из `@jumix/api-types`.
 */

export type UserRole = 'superadmin' | 'owner' | 'operator'
export type ClientKind = 'web' | 'mobile'

/** Пользователь как его возвращают login/verify эндпоинты. */
export interface AuthUser {
  id: string
  role: UserRole
  organizationId: string | null
  name: string
}

/** Ответ SMS verify / password login. */
export interface LoginResponse {
  accessToken: string
  refreshToken: string
  accessTokenExpiresAt: string
  refreshTokenExpiresAt: string
  user: AuthUser
}

/** Ответ POST /auth/refresh — только пара токенов. */
export interface RefreshResponse {
  accessToken: string
  refreshToken: string
  accessTokenExpiresAt: string
  refreshTokenExpiresAt: string
}

/** GET /auth/me — минимальный контекст. */
export interface AuthMeResponse {
  userId: string
  organizationId: string | null
  role: UserRole
  tokenVersion: number
}

// ---------- Dashboard ----------

export interface DashboardStats {
  pending: {
    craneProfiles: number
    organizationOperators: number
    cranes: number
  }
  active: {
    organizations: number
    craneProfiles: number
    cranes: number
    memberships: number
  }
  thisWeek: {
    newRegistrations: number
  }
}

/**
 * Owner-scoped dashboard stats. Отдельный endpoint /dashboard/owner-stats —
 * counters суженные до собственной org. Active = «живые» fleet/teams; pending
 * = approval queues для footer-CTA («есть N заявок ждущих холдинга»).
 */
export interface OwnerDashboardStats {
  active: {
    sites: number
    cranes: number
    memberships: number
  }
  pending: {
    cranes: number
    hires: number
  }
}

// ---------- Audit ----------

export type AuditActorRole = UserRole | 'system'

export interface RecentAuditEvent {
  id: string
  actor: {
    userId: string | null
    name: string | null
    role: AuditActorRole | string | null
  }
  action: string
  target: {
    type: string | null
    id: string | null
  }
  organizationId: string | null
  organizationName: string | null
  metadata: Record<string, unknown>
  ipAddress: string | null
  createdAt: string
}

export interface RecentAuditResponse {
  events: RecentAuditEvent[]
}

// ---------- Shared approval / pagination ----------

export type ApprovalStatus = 'pending' | 'approved' | 'rejected'
export type ApprovalFilter = ApprovalStatus | 'all'

export interface Paginated<T> {
  items: T[]
  nextCursor: string | null
}

// ---------- Organizations ----------

export type OrganizationStatus = 'active' | 'suspended' | 'archived'

export interface Organization {
  id: string
  name: string
  bin: string
  status: OrganizationStatus
  contactName: string | null
  contactPhone: string | null
  contactEmail: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateOrganizationInput {
  name: string
  bin: string
  contactName?: string
  contactPhone?: string
  contactEmail?: string
  ownerPhone: string
  ownerName: string
}

export interface CreateOrganizationResponse {
  organization: Organization
  owner: { id: string; phone: string }
}

// ---------- Crane profiles ----------

export type LicenseStatus = 'missing' | 'valid' | 'expiring_soon' | 'expiring_critical' | 'expired'

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

// ---------- Operator self-status (B3-UI-4) ----------

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
 * /me/status — single source-of-truth для operator web cabinet.
 * profile: полный DTO (как `GET /me`) + phone + license поля.
 * canWorkReasons: empty array когда canWork=true; иначе — blocking reasons.
 */
export interface MeStatusResponse {
  profile: CraneProfile
  memberships: MeStatusMembership[]
  licenseStatus: LicenseStatus
  canWork: boolean
  canWorkReasons: string[]
}

// ---------- Cranes ----------

export type CraneType = 'tower' | 'mobile' | 'crawler' | 'overhead'
export type CraneOperationalStatus = 'active' | 'maintenance' | 'retired'

export interface Crane {
  id: string
  organizationId: string
  siteId: string | null
  type: CraneType
  model: string
  inventoryNumber: string | null
  capacityTon: number
  boomLengthM: number | null
  yearManufactured: number | null
  status: CraneOperationalStatus
  approvalStatus: ApprovalStatus
  rejectionReason: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

// ---------- Sites ----------

export type SiteStatus = 'active' | 'completed' | 'archived'

export interface Site {
  id: string
  organizationId: string
  name: string
  address: string | null
  latitude: number
  longitude: number
  radiusM: number
  status: SiteStatus
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateSiteInput {
  name: string
  address?: string
  latitude: number
  longitude: number
  radiusM?: number
  notes?: string
}

export interface UpdateSiteInput {
  name?: string
  address?: string | null
  latitude?: number
  longitude?: number
  radiusM?: number
  notes?: string | null
}

// ---------- Organization operators (hires) ----------

export type OperatorHireStatus = 'active' | 'blocked' | 'terminated'

export interface OrganizationOperatorCraneProfileSnippet {
  id: string
  firstName: string
  lastName: string
  patronymic: string | null
  iin: string
  avatarUrl: string | null
  licenseStatus: LicenseStatus
}

export interface OrganizationOperator {
  id: string
  craneProfileId: string
  organizationId: string
  craneProfile: OrganizationOperatorCraneProfileSnippet
  hiredAt: string | null
  terminatedAt: string | null
  status: OperatorHireStatus
  availability: 'free' | 'busy' | 'on_shift' | null
  approvalStatus: ApprovalStatus
  rejectionReason: string | null
  phone?: string
  createdAt: string
  updatedAt: string
}

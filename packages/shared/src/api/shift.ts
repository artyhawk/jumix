/**
 * Shifts API types (M4, ADR 0006). Cross-app: apps/api endpoint DTO,
 * apps/web hooks, apps/mobile screens — все едят один и тот же shape.
 *
 * Когда появится генерированный OpenAPI — заменить на `@jumix/api-types`.
 */

export type ShiftStatus = 'active' | 'paused' | 'ended'

export interface Shift {
  id: string
  craneId: string
  operatorId: string
  craneProfileId: string
  organizationId: string
  siteId: string
  status: ShiftStatus
  startedAt: string
  endedAt: string | null
  pausedAt: string | null
  totalPauseSeconds: number
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface ShiftCraneSummary {
  id: string
  model: string
  inventoryNumber: string | null
  type: 'tower' | 'mobile' | 'crawler' | 'overhead'
  capacityTon: number
}

export interface ShiftSiteSummary {
  id: string
  name: string
  address: string | null
}

export interface ShiftOrganizationSummary {
  id: string
  name: string
}

export interface ShiftOperatorSummary {
  id: string
  firstName: string
  lastName: string
  patronymic: string | null
}

/**
 * Shift with nested relations — возвращается всеми read endpoints
 * (/shifts/:id, /shifts/my, /shifts/owner, /shifts/my/active).
 * Анти-N+1: клиент сразу получает crane.model / site.name / organization.name
 * без отдельных запросов.
 */
export interface ShiftWithRelations extends Shift {
  crane: ShiftCraneSummary
  site: ShiftSiteSummary
  organization: ShiftOrganizationSummary
  operator: ShiftOperatorSummary
}

export interface AvailableCrane {
  id: string
  model: string
  inventoryNumber: string | null
  type: 'tower' | 'mobile' | 'crawler' | 'overhead'
  capacityTon: number
  site: ShiftSiteSummary
  organization: ShiftOrganizationSummary
}

export interface StartShiftPayload {
  craneId: string
  notes?: string
}

export interface EndShiftPayload {
  notes?: string
}

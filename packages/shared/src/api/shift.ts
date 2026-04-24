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
  /**
   * Site coordinates + geofence radius — нужны mobile client'у для
   * client-side geofence computation (ADR 0007 §3). Surface'ятся в
   * каждом shift-endpoint'е, включая `/my/active`, чтобы mobile мог
   * init'ить tracking context без дополнительного round-trip'а.
   */
  latitude: number
  longitude: number
  geofenceRadiusM: number
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

/**
 * Minimal site shape для списков / эмbedded references — без PostGIS
 * coords. Используется в AvailableCrane, ActiveShiftLocation. Если
 * нужны coords (tracking init) — ShiftSiteSummary (полный).
 */
export interface ShiftSiteRef {
  id: string
  name: string
  address: string | null
}

export interface AvailableCrane {
  id: string
  model: string
  inventoryNumber: string | null
  type: 'tower' | 'mobile' | 'crawler' | 'overhead'
  capacityTon: number
  site: ShiftSiteRef
  organization: ShiftOrganizationSummary
}

export interface StartShiftPayload {
  craneId: string
  notes?: string
}

export interface EndShiftPayload {
  notes?: string
}

/**
 * Location ping — single GPS record (M5, ADR 0007). Отправляется mobile
 * клиентом batch'ами в `POST /api/v1/shifts/:id/pings`. Persistence shape
 * (server response) идентичен ingestion shape (client body).
 *
 * insideGeofence — client-computed: Haversine distance ping→site.coords с
 * accuracy tolerance (effective radius = site.radius + ping.accuracy). Null
 * когда client не смог рассчитать (site coords недоступны).
 */
export interface LocationPing {
  latitude: number
  longitude: number
  accuracyMeters: number | null
  recordedAt: string
  insideGeofence: boolean | null
}

export interface IngestPingsPayload {
  pings: LocationPing[]
}

export interface IngestPingsRejection {
  index: number
  reason: string
}

export interface IngestPingsResponse {
  accepted: number
  rejected: IngestPingsRejection[]
}

/**
 * Last-known location per active shift — источник данных для owner map
 * (rule #29). Hydrated с nested crane/operator/site summaries и
 * `minutesSinceLastPing` (computed server-side для stale-detection на клиенте).
 */
export interface ActiveShiftLocation {
  shiftId: string
  craneId: string
  operatorId: string
  siteId: string
  latitude: number
  longitude: number
  accuracyMeters: number | null
  recordedAt: string
  insideGeofence: boolean | null
  minutesSinceLastPing: number
  crane: ShiftCraneSummary
  operator: ShiftOperatorSummary
  site: ShiftSiteRef
}

/**
 * Shift path — polyline для визуализации маршрута смены. `sampleRate` query
 * param на endpoint'е downsample'ит (каждый N-ый ping) для больших историй.
 */
export interface ShiftPath {
  shiftId: string
  pings: LocationPing[]
}

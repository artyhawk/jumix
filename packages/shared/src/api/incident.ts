/**
 * Incidents (M6, ADR 0008) — operator reports проблемы во время или после
 * смены. Surface'ятся в owner web `/incidents` и mobile shifts/incidents.
 */

import type { CraneType } from './shift'

export const INCIDENT_TYPES = [
  'crane_malfunction',
  'material_fall',
  'near_miss',
  'minor_injury',
  'safety_violation',
  'other',
] as const
export type IncidentType = (typeof INCIDENT_TYPES)[number]

export const INCIDENT_TYPE_LABELS: Record<IncidentType, string> = {
  crane_malfunction: 'Неисправность крана',
  material_fall: 'Падение груза',
  near_miss: 'Опасная ситуация',
  minor_injury: 'Лёгкая травма',
  safety_violation: 'Нарушение ТБ',
  other: 'Другое',
}

export const INCIDENT_SEVERITIES = ['info', 'warning', 'critical'] as const
export type IncidentSeverity = (typeof INCIDENT_SEVERITIES)[number]

export const INCIDENT_SEVERITY_LABELS: Record<IncidentSeverity, string> = {
  info: 'Информационно',
  warning: 'Внимание',
  critical: 'Критично',
}

export const INCIDENT_STATUSES = ['submitted', 'acknowledged', 'resolved', 'escalated'] as const
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number]

export const INCIDENT_STATUS_LABELS: Record<IncidentStatus, string> = {
  submitted: 'Подано',
  acknowledged: 'Принято в работу',
  resolved: 'Решено',
  escalated: 'Эскалировано',
}

export interface IncidentPhoto {
  id: string
  storageKey: string
  /** Presigned GET URL — добавляется server-side при detail-fetch (15 минут TTL). */
  url?: string
  uploadedAt: string
}

export interface IncidentReporterSummary {
  id: string
  name: string
  phone: string
}

export interface IncidentShiftRef {
  id: string
  startedAt: string
  endedAt: string | null
}

export interface IncidentSiteRef {
  id: string
  name: string
  address: string | null
}

export interface IncidentCraneRef {
  id: string
  model: string
  inventoryNumber: string | null
  type: CraneType
}

export interface Incident {
  id: string
  reporter: IncidentReporterSummary
  organizationId: string
  shiftId: string | null
  siteId: string | null
  craneId: string | null
  type: IncidentType
  severity: IncidentSeverity
  status: IncidentStatus
  description: string
  reportedAt: string
  acknowledgedAt: string | null
  acknowledgedByUserId: string | null
  resolvedAt: string | null
  resolvedByUserId: string | null
  resolutionNotes: string | null
  latitude: number | null
  longitude: number | null
  photos: IncidentPhoto[]
  createdAt: string
  updatedAt: string
}

export interface IncidentWithRelations extends Incident {
  shift: IncidentShiftRef | null
  site: IncidentSiteRef | null
  crane: IncidentCraneRef | null
}

export interface CreateIncidentPayload {
  type: IncidentType
  severity: IncidentSeverity
  description: string
  photoKeys: string[]
  shiftId?: string
  latitude?: number
  longitude?: number
}

export interface RequestPhotoUploadUrlPayload {
  contentType: string
  filename: string
}

export interface RequestPhotoUploadUrlResponse {
  uploadUrl: string
  key: string
  headers: Record<string, string>
  expiresAt: string
}

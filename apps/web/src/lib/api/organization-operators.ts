import { apiFetch } from './client'
import type { ApprovalFilter, OperatorHireStatus, OrganizationOperator, Paginated } from './types'

export interface ListOrganizationOperatorsQuery {
  cursor?: string
  limit?: number
  search?: string
  approvalStatus?: ApprovalFilter
  status?: OperatorHireStatus | 'all'
  organizationId?: string
  craneProfileId?: string
}

export function listOrganizationOperators(query: ListOrganizationOperatorsQuery = {}) {
  const params = new URLSearchParams()
  if (query.cursor) params.set('cursor', query.cursor)
  if (query.limit) params.set('limit', String(query.limit))
  if (query.search) params.set('search', query.search)
  if (query.approvalStatus && query.approvalStatus !== 'all') {
    params.set('approvalStatus', query.approvalStatus)
  }
  if (query.status && query.status !== 'all') params.set('status', query.status)
  if (query.organizationId) params.set('organizationId', query.organizationId)
  if (query.craneProfileId) params.set('craneProfileId', query.craneProfileId)
  const qs = params.toString()
  return apiFetch<Paginated<OrganizationOperator>>(
    `/api/v1/organization-operators${qs ? `?${qs}` : ''}`,
    { method: 'GET' },
  )
}

export function getOrganizationOperator(id: string) {
  return apiFetch<OrganizationOperator>(`/api/v1/organization-operators/${id}`, {
    method: 'GET',
  })
}

export function approveOrganizationOperator(id: string) {
  return apiFetch<OrganizationOperator>(`/api/v1/organization-operators/${id}/approve`, {
    method: 'POST',
  })
}

export function rejectOrganizationOperator(id: string, reason: string) {
  return apiFetch<OrganizationOperator>(`/api/v1/organization-operators/${id}/reject`, {
    method: 'POST',
    body: { reason },
  })
}

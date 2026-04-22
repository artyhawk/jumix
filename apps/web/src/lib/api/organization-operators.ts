import { apiFetch } from './client'
import type { ApprovalFilter, OrganizationOperator, Paginated } from './types'

export interface ListOrganizationOperatorsQuery {
  cursor?: string
  limit?: number
  search?: string
  approvalStatus?: ApprovalFilter
  organizationId?: string
}

export function listOrganizationOperators(query: ListOrganizationOperatorsQuery = {}) {
  const params = new URLSearchParams()
  if (query.cursor) params.set('cursor', query.cursor)
  if (query.limit) params.set('limit', String(query.limit))
  if (query.search) params.set('search', query.search)
  if (query.approvalStatus && query.approvalStatus !== 'all') {
    params.set('approvalStatus', query.approvalStatus)
  }
  if (query.organizationId) params.set('organizationId', query.organizationId)
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

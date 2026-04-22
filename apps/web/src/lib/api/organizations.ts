import { apiFetch } from './client'
import type {
  CreateOrganizationInput,
  CreateOrganizationResponse,
  Organization,
  OrganizationStatus,
  Paginated,
} from './types'

export interface ListOrganizationsQuery {
  cursor?: string
  limit?: number
  search?: string
  status?: OrganizationStatus | 'all'
}

export function listOrganizations(query: ListOrganizationsQuery = {}) {
  const params = new URLSearchParams()
  if (query.cursor) params.set('cursor', query.cursor)
  if (query.limit) params.set('limit', String(query.limit))
  if (query.search) params.set('search', query.search)
  if (query.status && query.status !== 'all') params.set('status', query.status)
  const qs = params.toString()
  return apiFetch<Paginated<Organization>>(`/api/v1/organizations${qs ? `?${qs}` : ''}`, {
    method: 'GET',
  })
}

export function getOrganization(id: string) {
  return apiFetch<Organization>(`/api/v1/organizations/${id}`, { method: 'GET' })
}

export function createOrganization(input: CreateOrganizationInput) {
  return apiFetch<CreateOrganizationResponse>('/api/v1/organizations', {
    method: 'POST',
    body: input,
  })
}

export function suspendOrganization(id: string) {
  return apiFetch<Organization>(`/api/v1/organizations/${id}/suspend`, { method: 'POST' })
}

export function activateOrganization(id: string) {
  return apiFetch<Organization>(`/api/v1/organizations/${id}/activate`, { method: 'POST' })
}

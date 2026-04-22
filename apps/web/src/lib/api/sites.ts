import { apiFetch } from './client'
import type { CreateSiteInput, Paginated, Site, SiteStatus, UpdateSiteInput } from './types'

export interface ListSitesQuery {
  cursor?: string
  limit?: number
  search?: string
  status?: SiteStatus | 'all'
}

export function listSites(query: ListSitesQuery = {}) {
  const params = new URLSearchParams()
  if (query.cursor) params.set('cursor', query.cursor)
  if (query.limit) params.set('limit', String(query.limit))
  if (query.search) params.set('search', query.search)
  if (query.status && query.status !== 'all') params.set('status', query.status)
  const qs = params.toString()
  return apiFetch<Paginated<Site>>(`/api/v1/sites${qs ? `?${qs}` : ''}`, { method: 'GET' })
}

export function getSite(id: string) {
  return apiFetch<Site>(`/api/v1/sites/${id}`, { method: 'GET' })
}

export function createSite(input: CreateSiteInput) {
  return apiFetch<Site>('/api/v1/sites', { method: 'POST', body: input })
}

export function updateSite(id: string, patch: UpdateSiteInput) {
  return apiFetch<Site>(`/api/v1/sites/${id}`, { method: 'PATCH', body: patch })
}

export function completeSite(id: string) {
  return apiFetch<Site>(`/api/v1/sites/${id}/complete`, { method: 'POST' })
}

export function archiveSite(id: string) {
  return apiFetch<Site>(`/api/v1/sites/${id}/archive`, { method: 'POST' })
}

export function activateSite(id: string) {
  return apiFetch<Site>(`/api/v1/sites/${id}/activate`, { method: 'POST' })
}

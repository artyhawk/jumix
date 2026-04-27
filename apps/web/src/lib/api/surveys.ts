import type {
  SurveyListItem,
  SurveyResponseDetail,
  SurveyResponseListItem,
  SurveyWithQuestions,
} from '@jumix/shared'
import { apiFetch } from './client'
import type { Paginated } from './types'

/**
 * Admin surveys API (B3-SURVEY). Superadmin-only — backend гарантирует authz;
 * frontend дополнительно скрывает nav для остальных ролей.
 */

export function listAdminSurveys(): Promise<SurveyListItem[]> {
  return apiFetch<SurveyListItem[]>('/api/v1/admin/surveys', { method: 'GET' })
}

export function getAdminSurvey(slug: string): Promise<SurveyWithQuestions> {
  return apiFetch<SurveyWithQuestions>(`/api/v1/admin/surveys/${encodeURIComponent(slug)}`, {
    method: 'GET',
  })
}

export interface ListSurveyResponsesQuery {
  cursor?: string
  limit?: number
  q?: string
  from?: string
  to?: string
  includeSpam?: boolean
}

export function listSurveyResponses(
  slug: string,
  query: ListSurveyResponsesQuery = {},
): Promise<Paginated<SurveyResponseListItem>> {
  const params = new URLSearchParams()
  if (query.cursor) params.set('cursor', query.cursor)
  if (query.limit) params.set('limit', String(query.limit))
  if (query.q) params.set('q', query.q)
  if (query.from) params.set('from', query.from)
  if (query.to) params.set('to', query.to)
  if (query.includeSpam) params.set('includeSpam', 'true')
  const qs = params.toString()
  return apiFetch<Paginated<SurveyResponseListItem>>(
    `/api/v1/admin/surveys/${encodeURIComponent(slug)}/responses${qs ? `?${qs}` : ''}`,
    { method: 'GET' },
  )
}

export function getSurveyResponse(slug: string, id: string): Promise<SurveyResponseDetail> {
  return apiFetch<SurveyResponseDetail>(
    `/api/v1/admin/surveys/${encodeURIComponent(slug)}/responses/${encodeURIComponent(id)}`,
    { method: 'GET' },
  )
}

'use client'

import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import {
  type ListSurveyResponsesQuery,
  getAdminSurvey,
  getSurveyResponse,
  listAdminSurveys,
  listSurveyResponses,
} from '../api/surveys'
import { qk } from '../query-keys'

/**
 * Web hooks для admin surveys (B3-SURVEY). Read-only — нет mutations
 * (responses не правятся, surveys hardcoded).
 */

export function useAdminSurveysList() {
  return useQuery({
    queryKey: qk.surveysList,
    queryFn: () => listAdminSurveys(),
    staleTime: 30_000,
  })
}

export function useAdminSurvey(slug: string | null) {
  return useQuery({
    queryKey: slug ? qk.surveyDetail(slug) : ['surveys', 'detail', 'disabled'],
    queryFn: () => {
      if (!slug) throw new Error('missing slug')
      return getAdminSurvey(slug)
    },
    enabled: Boolean(slug),
    staleTime: 60_000,
  })
}

export function useSurveyResponsesInfinite(
  slug: string | null,
  query: Omit<ListSurveyResponsesQuery, 'cursor'> = {},
) {
  return useInfiniteQuery({
    queryKey: slug ? qk.surveyResponsesInfinite(slug, query) : ['surveys', 'disabled'],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      if (!slug) throw new Error('missing slug')
      return listSurveyResponses(slug, { ...query, cursor: pageParam })
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled: Boolean(slug),
    staleTime: 30_000,
  })
}

export function useSurveyResponseDetail(slug: string | null, id: string | null) {
  return useQuery({
    queryKey: slug && id ? qk.surveyResponseDetail(slug, id) : ['surveys', 'response', 'disabled'],
    queryFn: () => {
      if (!slug || !id) throw new Error('missing slug or id')
      return getSurveyResponse(slug, id)
    },
    enabled: Boolean(slug && id),
  })
}

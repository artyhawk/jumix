import { createQueryWrapper } from '@/test-utils/query-wrapper'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../api/surveys', () => ({
  listAdminSurveys: vi.fn(),
  getAdminSurvey: vi.fn(),
  listSurveyResponses: vi.fn(),
  getSurveyResponse: vi.fn(),
}))

import {
  getAdminSurvey,
  getSurveyResponse,
  listAdminSurveys,
  listSurveyResponses,
} from '../api/surveys'
import {
  useAdminSurvey,
  useAdminSurveysList,
  useSurveyResponseDetail,
  useSurveyResponsesInfinite,
} from './use-surveys'

const list = vi.mocked(listAdminSurveys)
const detail = vi.mocked(getAdminSurvey)
const responses = vi.mocked(listSurveyResponses)
const response = vi.mocked(getSurveyResponse)

beforeEach(() => {
  list.mockReset()
  detail.mockReset()
  responses.mockReset()
  response.mockReset()
})

describe('useAdminSurveysList', () => {
  it('fetches templates', async () => {
    list.mockResolvedValueOnce([
      {
        id: 's1',
        slug: 'b2b-ru',
        title: 'B2B RU',
        audience: 'b2b',
        locale: 'ru',
        questionCount: 11,
        responseCount: 5,
        latestResponseAt: '2026-04-25T10:00:00Z',
        isActive: true,
      },
    ])
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useAdminSurveysList(), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(1)
    expect(result.current.data?.[0]?.slug).toBe('b2b-ru')
  })
})

describe('useAdminSurvey', () => {
  it('disabled когда slug == null', () => {
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useAdminSurvey(null), { wrapper: Wrapper })
    expect(detail).not.toHaveBeenCalled()
    expect(result.current.fetchStatus).toBe('idle')
  })

  it('fetches detail when slug provided', async () => {
    detail.mockResolvedValueOnce({
      id: 's1',
      slug: 'b2b-ru',
      title: 'B2B RU',
      subtitle: 'sub',
      audience: 'b2b',
      locale: 'ru',
      intro: 'i',
      outro: 'o',
      questionCount: 1,
      isActive: true,
      createdAt: '2026-04-01T00:00:00Z',
      questions: [],
    })
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useAdminSurvey('b2b-ru'), { wrapper: Wrapper })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(detail).toHaveBeenCalledWith('b2b-ru')
  })
})

describe('useSurveyResponsesInfinite', () => {
  it('paginates via cursor', async () => {
    responses.mockImplementation(async (_slug, query) => {
      if (!query?.cursor) return { items: [{ id: 'r1' } as never], nextCursor: 'cur-1' }
      return { items: [{ id: 'r2' } as never], nextCursor: null }
    })
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useSurveyResponsesInfinite('b2b-ru', { limit: 1 }), {
      wrapper: Wrapper,
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data?.pages[0]?.items).toHaveLength(1)

    await result.current.fetchNextPage()
    await waitFor(() => expect(result.current.data?.pages.length).toBe(2))
  })

  it('passes search filter through', async () => {
    responses.mockResolvedValueOnce({ items: [], nextCursor: null })
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(
      () => useSurveyResponsesInfinite('b2b-ru', { q: 'Excel', includeSpam: true }),
      {
        wrapper: Wrapper,
      },
    )
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(responses).toHaveBeenCalledWith('b2b-ru', {
      q: 'Excel',
      includeSpam: true,
      cursor: undefined,
    })
  })
})

describe('useSurveyResponseDetail', () => {
  it('disabled when slug or id missing', () => {
    const { Wrapper } = createQueryWrapper()
    renderHook(() => useSurveyResponseDetail(null, 'r1'), { wrapper: Wrapper })
    renderHook(() => useSurveyResponseDetail('b2b-ru', null), { wrapper: Wrapper })
    expect(response).not.toHaveBeenCalled()
  })

  it('fetches detail with both', async () => {
    response.mockResolvedValueOnce({
      id: 'r1',
      surveyId: 's1',
      surveySlug: 'b2b-ru',
      surveyTitle: 'B2B',
      fullName: 'Иван',
      phone: '+77001234567',
      email: 'i@i.kz',
      honeypotFilled: false,
      ipAddress: null,
      userAgent: null,
      submittedAt: '2026-04-25T10:00:00Z',
      answers: [],
    })
    const { Wrapper } = createQueryWrapper()
    const { result } = renderHook(() => useSurveyResponseDetail('b2b-ru', 'r1'), {
      wrapper: Wrapper,
    })
    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(response).toHaveBeenCalledWith('b2b-ru', 'r1')
  })
})

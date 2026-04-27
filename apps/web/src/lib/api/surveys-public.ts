import type {
  SubmitSurveyResponsePayload,
  SubmitSurveyResponseResult,
  SurveyWithQuestions,
} from '@jumix/shared'
import { publicFetch } from './public-fetch'

/**
 * Public surveys API — no auth (B3-SURVEY).
 */

export function getPublicSurvey(slug: string): Promise<SurveyWithQuestions> {
  return publicFetch<SurveyWithQuestions>(`/api/v1/surveys/${encodeURIComponent(slug)}`, {
    method: 'GET',
  })
}

export function submitPublicSurveyResponse(
  slug: string,
  payload: SubmitSurveyResponsePayload,
): Promise<SubmitSurveyResponseResult> {
  return publicFetch<SubmitSurveyResponseResult>(
    `/api/v1/surveys/${encodeURIComponent(slug)}/responses`,
    {
      method: 'POST',
      body: payload,
    },
  )
}

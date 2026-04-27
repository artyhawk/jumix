/**
 * Customer development surveys (B3-SURVEY) — types shared between web public
 * survey UX, web admin section, и backend module.
 *
 * Все timestamps на wire — ISO 8601 UTC strings (как остальной API).
 */

export const SURVEY_AUDIENCES = ['b2b', 'b2c'] as const
export type SurveyAudience = (typeof SURVEY_AUDIENCES)[number]

export const SURVEY_LOCALES = ['ru', 'kk', 'en'] as const
export type SurveyLocale = (typeof SURVEY_LOCALES)[number]

export const SURVEY_AUDIENCE_LABELS: Record<SurveyAudience, string> = {
  b2b: 'Компании',
  b2c: 'Крановщики',
}

export const SURVEY_LOCALE_LABELS: Record<SurveyLocale, string> = {
  ru: 'Русский',
  kk: 'Қазақша',
  en: 'English',
}

export interface Survey {
  id: string
  slug: string
  title: string
  subtitle: string
  audience: SurveyAudience
  locale: SurveyLocale
  intro: string
  outro: string
  questionCount: number
  isActive: boolean
  createdAt: string
}

export interface SurveyQuestion {
  id: string
  surveyId: string
  position: number
  groupKey: string
  groupTitle: string
  questionText: string
  hint: string | null
  isRequired: boolean
}

export interface SurveyWithQuestions extends Survey {
  questions: SurveyQuestion[]
}

export interface SubmitSurveyResponsePayload {
  fullName: string
  phone: string
  email: string
  /** Keyed by question position as string: `{ "1": "answer text", ... }`. */
  answers: Record<string, string>
  /** Hidden form field — bots fill it; server silently rejects (200 + marker). */
  honeypot?: string
}

export interface SubmitSurveyResponseResult {
  id: string
  submittedAt: string
}

export interface SurveyListItem {
  id: string
  slug: string
  title: string
  audience: SurveyAudience
  locale: SurveyLocale
  questionCount: number
  responseCount: number
  latestResponseAt: string | null
  isActive: boolean
}

export interface SurveyResponseListItem {
  id: string
  fullName: string
  phone: string
  email: string
  honeypotFilled: boolean
  submittedAt: string
}

export interface SurveyResponseAnswer {
  position: number
  groupKey: string
  groupTitle: string
  questionText: string
  /** May be empty string if question was optional and respondent skipped. */
  answer: string
}

export interface SurveyResponseDetail {
  id: string
  surveyId: string
  surveySlug: string
  surveyTitle: string
  fullName: string
  phone: string
  email: string
  honeypotFilled: boolean
  ipAddress: string | null
  userAgent: string | null
  submittedAt: string
  answers: SurveyResponseAnswer[]
}

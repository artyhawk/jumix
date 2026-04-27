import { sql } from 'drizzle-orm'
import { boolean, check, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { surveys } from './surveys'

/**
 * survey_responses (B3-SURVEY) — public submissions.
 *
 * `answers` jsonb — keyed by question position-as-string ({"1": "...", "2":
 * "..."}). Variable schema per survey, easier text search через JSONB
 * операторы, single INSERT vs N+1 row inserts. Validation структуры
 * происходит на app-слое (against survey_questions для конкретного survey_id).
 *
 * Контактные данные (full_name/phone/email) DENORMALIZED в колонки —
 * lead-generation use case требует индексов и фильтров без JSONB-extract'ов;
 * формат phone/email enforced DB-level CHECK'ами для отлова bad data на
 * самой ранней стадии.
 *
 * `honeypot_filled` — bot detection: если hidden form field заполнен,
 * response сохраняется (для bot-pattern analytics) но фильтруется default'ом
 * в admin UI. Backend возвращает 200 OK к bot'у — silent rejection, чтобы не
 * информировать о механизме защиты.
 *
 * ON DELETE RESTRICT для → surveys: surveys никогда не удаляются (только
 * is_active=false). Historical data integrity preserved.
 */
export const surveyResponses = pgTable(
  'survey_responses',
  {
    id: uuid().primaryKey().defaultRandom(),
    surveyId: uuid()
      .notNull()
      .references(() => surveys.id, { onDelete: 'restrict' }),
    fullName: text().notNull(),
    phone: text().notNull(),
    email: text().notNull(),
    answers: jsonb().$type<Record<string, string>>().notNull(),
    ipAddress: text(),
    userAgent: text(),
    honeypotFilled: boolean().notNull().default(false),
    submittedAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    index('survey_responses_survey_submitted_idx').on(t.surveyId, sql`submitted_at DESC`),
    index('survey_responses_phone_idx').on(t.phone),
    index('survey_responses_submitted_idx').on(sql`submitted_at DESC`),
    check('survey_responses_full_name_not_blank_chk', sql`length(trim(${t.fullName})) > 0`),
    check('survey_responses_phone_format_chk', sql`${t.phone} ~ '^\\+7[0-9]{10}$'`),
    check(
      'survey_responses_email_format_chk',
      sql`${t.email} ~ '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$'`,
    ),
  ],
)

export type SurveyResponse = {
  id: string
  surveyId: string
  fullName: string
  phone: string
  email: string
  answers: Record<string, string>
  ipAddress: string | null
  userAgent: string | null
  honeypotFilled: boolean
  submittedAt: Date
}

export type NewSurveyResponse = typeof surveyResponses.$inferInsert

import { sql } from 'drizzle-orm'
import { boolean, check, index, integer, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

/**
 * surveys (B3-SURVEY) — customer development survey templates.
 *
 * Hardcoded через seed (4 шт. на старте: b2b-ru / b2b-kk / b2c-ru / b2c-kk),
 * но структура нормализована для добавления новых без code-change. Slug —
 * stable программный handle, по которому public endpoint находит template
 * (`POST /api/v1/surveys/:slug/responses`). is_active — admin-контролируемый
 * toggle visibility без удаления (preserves исторические responses).
 *
 * Audience b2b — компании (владельцы кранов, стройкомпании); b2c —
 * крановщики. Locale ru/kk/en (en зарезервировано на будущее).
 */
export const surveys = pgTable(
  'surveys',
  {
    id: uuid().primaryKey().defaultRandom(),
    slug: text().notNull().unique(),
    title: text().notNull(),
    subtitle: text().notNull(),
    audience: text().notNull(),
    locale: text().notNull(),
    intro: text().notNull(),
    outro: text().notNull(),
    questionCount: integer().notNull(),
    isActive: boolean().notNull().default(true),
    createdAt: timestamp({ withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    index('surveys_active_idx').on(t.isActive).where(sql`is_active = true`),
    check('surveys_audience_chk', sql`${t.audience} IN ('b2b', 'b2c')`),
    check('surveys_locale_chk', sql`${t.locale} IN ('ru', 'kk', 'en')`),
  ],
)

export const SURVEY_AUDIENCES = ['b2b', 'b2c'] as const
export type SurveyAudience = (typeof SURVEY_AUDIENCES)[number]

export const SURVEY_LOCALES = ['ru', 'kk', 'en'] as const
export type SurveyLocale = (typeof SURVEY_LOCALES)[number]

export type Survey = {
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
  createdAt: Date
}

export type NewSurvey = typeof surveys.$inferInsert

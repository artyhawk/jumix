import { sql } from 'drizzle-orm'
import { boolean, check, index, integer, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core'
import { surveys } from './surveys'

/**
 * survey_questions (B3-SURVEY) — variable questions per survey, position-ordered.
 *
 * group_key + group_title — UI sections (Блок А Контекст / Б Болит / В Деньги
 * for B2B). group_key — programmatic id, group_title — human-readable label
 * показанный в progress bar ("Раздел 1 из 3: Контекст бизнеса").
 *
 * is_required — server validates на submission (admin может в будущем сделать
 * optional questions; в seed pока все required).
 *
 * UNIQUE(survey_id, position) — гарантия что render order стабилен и нет
 * дубликатов при seed re-run'е.
 */
export const surveyQuestions = pgTable(
  'survey_questions',
  {
    id: uuid().primaryKey().defaultRandom(),
    surveyId: uuid()
      .notNull()
      .references(() => surveys.id, { onDelete: 'cascade' }),
    position: integer().notNull(),
    groupKey: text().notNull(),
    groupTitle: text().notNull(),
    questionText: text().notNull(),
    hint: text(),
    isRequired: boolean().notNull().default(true),
  },
  (t) => [
    unique('survey_questions_position_uq').on(t.surveyId, t.position),
    index('survey_questions_survey_position_idx').on(t.surveyId, t.position),
    check('survey_questions_position_positive_chk', sql`${t.position} > 0`),
  ],
)

export type SurveyQuestion = {
  id: string
  surveyId: string
  position: number
  groupKey: string
  groupTitle: string
  questionText: string
  hint: string | null
  isRequired: boolean
}

export type NewSurveyQuestion = typeof surveyQuestions.$inferInsert

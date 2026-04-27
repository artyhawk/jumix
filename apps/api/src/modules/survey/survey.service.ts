import type { AuthContext } from '@jumix/auth'
import {
  type DatabaseClient,
  type SurveyAudience,
  type SurveyLocale,
  surveyQuestions,
  surveyResponses,
  surveys,
} from '@jumix/db'
import type {
  SubmitSurveyResponseResult,
  SurveyListItem,
  SurveyResponseDetail,
  SurveyResponseListItem,
  SurveyWithQuestions,
} from '@jumix/shared'
import { and, asc, count, desc, eq, gte, lt, lte, max, sql } from 'drizzle-orm'
import type { FastifyBaseLogger } from 'fastify'
import { AppError } from '../../lib/errors'
import { surveyPolicy } from './survey.policy'
import type { ListResponsesQuery, SubmitSurveyResponseInput } from './survey.schemas'

export type SubmissionMeta = {
  ipAddress: string | null
  userAgent: string | null
}

function notFound(): AppError {
  return new AppError({
    statusCode: 404,
    code: 'SURVEY_NOT_FOUND',
    message: 'Survey not found',
  })
}
function forbidden(): AppError {
  return new AppError({ statusCode: 403, code: 'FORBIDDEN', message: 'Access denied' })
}
function unprocessable(code: string, message: string, details?: Record<string, unknown>): AppError {
  return new AppError({ statusCode: 422, code, message, details })
}

export class SurveyService {
  constructor(
    private readonly database: DatabaseClient,
    private readonly logger: FastifyBaseLogger,
  ) {}

  /**
   * Public — fetch active survey by slug for rendering. Inactive / missing →
   * 404 (без раскрытия — просто not found, как для bot'а так и user'а с
   * stale link'ом).
   */
  async getPublicBySlug(slug: string): Promise<SurveyWithQuestions> {
    const surveyRow = (
      await this.database.db
        .select()
        .from(surveys)
        .where(and(eq(surveys.slug, slug), eq(surveys.isActive, true)))
        .limit(1)
    )[0]
    if (!surveyRow) throw notFound()

    const questionRows = await this.database.db
      .select()
      .from(surveyQuestions)
      .where(eq(surveyQuestions.surveyId, surveyRow.id))
      .orderBy(asc(surveyQuestions.position))

    return {
      id: surveyRow.id,
      slug: surveyRow.slug,
      title: surveyRow.title,
      subtitle: surveyRow.subtitle,
      audience: surveyRow.audience as SurveyAudience,
      locale: surveyRow.locale as SurveyLocale,
      intro: surveyRow.intro,
      outro: surveyRow.outro,
      questionCount: surveyRow.questionCount,
      isActive: surveyRow.isActive,
      createdAt: surveyRow.createdAt.toISOString(),
      questions: questionRows.map((q) => ({
        id: q.id,
        surveyId: q.surveyId,
        position: q.position,
        groupKey: q.groupKey,
        groupTitle: q.groupTitle,
        questionText: q.questionText,
        hint: q.hint,
        isRequired: q.isRequired,
      })),
    }
  }

  /**
   * Public — submit response. Honeypot-filled responses сохраняются с marker
   * (для bot-pattern analytics) но returns same 200 OK как и valid submission.
   *
   * Required answers validation — server-side check against survey_questions
   * (client form тоже валидирует, но trust-no-client). Missing required → 422.
   */
  async submitResponse(
    slug: string,
    input: SubmitSurveyResponseInput,
    meta: SubmissionMeta,
  ): Promise<SubmitSurveyResponseResult> {
    const surveyRow = (
      await this.database.db
        .select({ id: surveys.id, isActive: surveys.isActive })
        .from(surveys)
        .where(eq(surveys.slug, slug))
        .limit(1)
    )[0]
    if (!surveyRow || !surveyRow.isActive) throw notFound()

    const honeypotFilled = Boolean(input.honeypot && input.honeypot.trim().length > 0)

    // Bot-path: store with marker, return success. Skip required-answers check
    // (bot may not have submitted them).
    if (honeypotFilled) {
      const [row] = await this.database.db
        .insert(surveyResponses)
        .values({
          surveyId: surveyRow.id,
          fullName: input.fullName,
          phone: input.phone,
          email: input.email,
          answers: input.answers,
          ipAddress: meta.ipAddress,
          userAgent: meta.userAgent,
          honeypotFilled: true,
        })
        .returning({ id: surveyResponses.id, submittedAt: surveyResponses.submittedAt })
      if (!row) {
        throw new AppError({
          statusCode: 500,
          code: 'SURVEY_SUBMIT_FAILED',
          message: 'Failed to record response',
        })
      }
      this.logger.info(
        { surveyId: surveyRow.id, ip: meta.ipAddress },
        'survey response: honeypot filled (bot suspected)',
      )
      return { id: row.id, submittedAt: row.submittedAt.toISOString() }
    }

    // Real-path: validate required questions covered.
    const requiredRows = await this.database.db
      .select({ position: surveyQuestions.position })
      .from(surveyQuestions)
      .where(and(eq(surveyQuestions.surveyId, surveyRow.id), eq(surveyQuestions.isRequired, true)))

    const missing: number[] = []
    for (const r of requiredRows) {
      const v = input.answers[String(r.position)]
      if (typeof v !== 'string' || v.trim().length === 0) missing.push(r.position)
    }
    if (missing.length > 0) {
      throw unprocessable('MISSING_REQUIRED_ANSWERS', 'Some required questions are unanswered', {
        missingPositions: missing,
      })
    }

    const [row] = await this.database.db
      .insert(surveyResponses)
      .values({
        surveyId: surveyRow.id,
        fullName: input.fullName,
        phone: input.phone,
        email: input.email,
        answers: input.answers,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        honeypotFilled: false,
      })
      .returning({ id: surveyResponses.id, submittedAt: surveyResponses.submittedAt })

    if (!row) {
      throw new AppError({
        statusCode: 500,
        code: 'SURVEY_SUBMIT_FAILED',
        message: 'Failed to record response',
      })
    }

    return { id: row.id, submittedAt: row.submittedAt.toISOString() }
  }

  /**
   * Admin — list all surveys с aggregated counts. Single query через LEFT
   * JOIN с GROUP BY — простая для 4 templates, не масштабируется до 1000s,
   * но в нашем случае их единицы.
   */
  async listAdmin(ctx: AuthContext): Promise<SurveyListItem[]> {
    if (!surveyPolicy.canViewAdmin(ctx)) throw forbidden()

    const rows = await this.database.db
      .select({
        id: surveys.id,
        slug: surveys.slug,
        title: surveys.title,
        audience: surveys.audience,
        locale: surveys.locale,
        questionCount: surveys.questionCount,
        isActive: surveys.isActive,
        createdAt: surveys.createdAt,
        responseCount: count(surveyResponses.id),
        latestResponseAt: max(surveyResponses.submittedAt),
      })
      .from(surveys)
      .leftJoin(surveyResponses, eq(surveyResponses.surveyId, surveys.id))
      .groupBy(surveys.id)
      .orderBy(desc(surveys.createdAt))

    return rows.map((r) => ({
      id: r.id,
      slug: r.slug,
      title: r.title,
      audience: r.audience as SurveyAudience,
      locale: r.locale as SurveyLocale,
      questionCount: r.questionCount,
      responseCount: Number(r.responseCount),
      latestResponseAt: r.latestResponseAt
        ? new Date(r.latestResponseAt as Date | string).toISOString()
        : null,
      isActive: r.isActive,
    }))
  }

  /**
   * Admin — fetch single survey-with-questions (for header context на
   * /surveys/[slug] page). Возвращает inactive surveys (admin should see them).
   */
  async getAdminBySlug(ctx: AuthContext, slug: string): Promise<SurveyWithQuestions> {
    if (!surveyPolicy.canViewAdmin(ctx)) throw forbidden()
    const surveyRow = (
      await this.database.db.select().from(surveys).where(eq(surveys.slug, slug)).limit(1)
    )[0]
    if (!surveyRow) throw notFound()

    const questionRows = await this.database.db
      .select()
      .from(surveyQuestions)
      .where(eq(surveyQuestions.surveyId, surveyRow.id))
      .orderBy(asc(surveyQuestions.position))

    return {
      id: surveyRow.id,
      slug: surveyRow.slug,
      title: surveyRow.title,
      subtitle: surveyRow.subtitle,
      audience: surveyRow.audience as SurveyAudience,
      locale: surveyRow.locale as SurveyLocale,
      intro: surveyRow.intro,
      outro: surveyRow.outro,
      questionCount: surveyRow.questionCount,
      isActive: surveyRow.isActive,
      createdAt: surveyRow.createdAt.toISOString(),
      questions: questionRows.map((q) => ({
        id: q.id,
        surveyId: q.surveyId,
        position: q.position,
        groupKey: q.groupKey,
        groupTitle: q.groupTitle,
        questionText: q.questionText,
        hint: q.hint,
        isRequired: q.isRequired,
      })),
    }
  }

  /**
   * Admin — paginated responses list. Cursor — submitted_at ISO timestamp
   * (стабилен per-survey: index survey_responses_survey_submitted_idx). Search
   * `q` идёт через JSONB-cast'ing answers → text + ILIKE; ОК для current
   * volume (десятки/сотни responses), но если станет тысячи — переехать на
   * to_tsvector + GIN index (backlog).
   */
  async listResponses(
    ctx: AuthContext,
    slug: string,
    query: ListResponsesQuery,
  ): Promise<{ items: SurveyResponseListItem[]; nextCursor: string | null }> {
    if (!surveyPolicy.canViewAdmin(ctx)) throw forbidden()

    const surveyRow = (
      await this.database.db
        .select({ id: surveys.id })
        .from(surveys)
        .where(eq(surveys.slug, slug))
        .limit(1)
    )[0]
    if (!surveyRow) throw notFound()

    const conditions = [eq(surveyResponses.surveyId, surveyRow.id)]
    if (!query.includeSpam) {
      conditions.push(eq(surveyResponses.honeypotFilled, false))
    }
    if (query.q) {
      // JSONB → text cast для substring search across all answers + contact.
      conditions.push(
        sql`(${surveyResponses.fullName} ILIKE ${`%${query.q}%`}
          OR ${surveyResponses.phone} ILIKE ${`%${query.q}%`}
          OR ${surveyResponses.email} ILIKE ${`%${query.q}%`}
          OR (${surveyResponses.answers}::text) ILIKE ${`%${query.q}%`})`,
      )
    }
    if (query.from) {
      const fromDate = new Date(query.from)
      if (!Number.isNaN(fromDate.getTime())) {
        conditions.push(gte(surveyResponses.submittedAt, fromDate))
      }
    }
    if (query.to) {
      const toDate = new Date(query.to)
      if (!Number.isNaN(toDate.getTime())) {
        conditions.push(lte(surveyResponses.submittedAt, toDate))
      }
    }
    if (query.cursor) {
      const cursorDate = new Date(query.cursor)
      if (!Number.isNaN(cursorDate.getTime())) {
        // submittedAt DESC pagination — fetch rows older than cursor.
        conditions.push(lt(surveyResponses.submittedAt, cursorDate))
      }
    }

    const limit = query.limit
    const rows = await this.database.db
      .select({
        id: surveyResponses.id,
        fullName: surveyResponses.fullName,
        phone: surveyResponses.phone,
        email: surveyResponses.email,
        honeypotFilled: surveyResponses.honeypotFilled,
        submittedAt: surveyResponses.submittedAt,
      })
      .from(surveyResponses)
      .where(and(...conditions))
      .orderBy(desc(surveyResponses.submittedAt))
      .limit(limit + 1)

    const items = rows.slice(0, limit).map((r) => ({
      id: r.id,
      fullName: r.fullName,
      phone: r.phone,
      email: r.email,
      honeypotFilled: r.honeypotFilled,
      submittedAt: r.submittedAt.toISOString(),
    }))
    const nextCursor = rows.length > limit ? (items[items.length - 1]?.submittedAt ?? null) : null

    return { items, nextCursor }
  }

  /**
   * Admin — single response detail с questions joined для render Q&A list.
   */
  async getResponseDetail(
    ctx: AuthContext,
    slug: string,
    id: string,
  ): Promise<SurveyResponseDetail> {
    if (!surveyPolicy.canViewAdmin(ctx)) throw forbidden()

    const surveyRow = (
      await this.database.db
        .select({ id: surveys.id, slug: surveys.slug, title: surveys.title })
        .from(surveys)
        .where(eq(surveys.slug, slug))
        .limit(1)
    )[0]
    if (!surveyRow) throw notFound()

    const responseRow = (
      await this.database.db
        .select()
        .from(surveyResponses)
        .where(and(eq(surveyResponses.id, id), eq(surveyResponses.surveyId, surveyRow.id)))
        .limit(1)
    )[0]
    if (!responseRow) {
      throw new AppError({
        statusCode: 404,
        code: 'SURVEY_RESPONSE_NOT_FOUND',
        message: 'Survey response not found',
      })
    }

    const questionRows = await this.database.db
      .select({
        position: surveyQuestions.position,
        groupKey: surveyQuestions.groupKey,
        groupTitle: surveyQuestions.groupTitle,
        questionText: surveyQuestions.questionText,
      })
      .from(surveyQuestions)
      .where(eq(surveyQuestions.surveyId, surveyRow.id))
      .orderBy(asc(surveyQuestions.position))

    const answers = questionRows.map((q) => ({
      position: q.position,
      groupKey: q.groupKey,
      groupTitle: q.groupTitle,
      questionText: q.questionText,
      answer: responseRow.answers[String(q.position)] ?? '',
    }))

    return {
      id: responseRow.id,
      surveyId: surveyRow.id,
      surveySlug: surveyRow.slug,
      surveyTitle: surveyRow.title,
      fullName: responseRow.fullName,
      phone: responseRow.phone,
      email: responseRow.email,
      honeypotFilled: responseRow.honeypotFilled,
      ipAddress: responseRow.ipAddress,
      userAgent: responseRow.userAgent,
      submittedAt: responseRow.submittedAt.toISOString(),
      answers,
    }
  }
}

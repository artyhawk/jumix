import { surveyQuestions, surveyResponses, surveys } from '@jumix/db'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { type TestAppHandle, buildTestApp } from './helpers/build-test-app'
import { createOrganization, createUser, signTokenFor } from './helpers/fixtures'

/**
 * Integration tests для customer development surveys (B3-SURVEY).
 *
 * Покрывает:
 *  - Public GET /api/v1/surveys/:slug — happy + 404 inactive/missing
 *  - Public POST /api/v1/surveys/:slug/responses — happy, honeypot, validation,
 *    rate-limit, missing required, inactive survey
 *  - Admin GET /api/v1/admin/surveys — list с counts
 *  - Admin GET /api/v1/admin/surveys/:slug — survey detail (active + inactive)
 *  - Admin GET /api/v1/admin/surveys/:slug/responses — pagination, filters,
 *    spam toggle, search
 *  - Admin GET /api/v1/admin/surveys/:slug/responses/:id — full Q&A detail
 *  - Authz: owner / operator → 403; unauthenticated → 401
 *
 * Rate-limit: каждый submission-test использует уникальный X-Forwarded-For,
 * чтобы не исчерпать 3 submissions per IP per 24h раньше rate-limit-теста.
 * Trust-proxy=true в app.ts позволяет fastify уважать этот header → req.ip
 * берёт его → keyGenerator @fastify/rate-limit использует req.ip.
 *
 * BIN-серия 69xxxx. Phone серия +77890xxxxxx. IP серия 10.55.x.x (RFC1918).
 */

let handle: TestAppHandle
let superadminToken: string
let ownerToken: string
let operatorToken: string
let testSurveyId: string

let ipSeq = 0
function nextIp(): string {
  ipSeq += 1
  // Уникальный IP per request — третий октет крутится 1..254, четвёртый 1..254.
  const a = Math.floor(ipSeq / 254) + 1
  const b = (ipSeq % 254) + 1
  return `10.55.${a}.${b}`
}

async function submitResponse(
  slug: string,
  payload: Record<string, unknown>,
  options: { ip?: string; userAgent?: string } = {},
) {
  const headers: Record<string, string> = {
    'x-forwarded-for': options.ip ?? nextIp(),
  }
  if (options.userAgent) headers['user-agent'] = options.userAgent
  return handle.app.inject({
    method: 'POST',
    url: `/api/v1/surveys/${slug}/responses`,
    headers,
    payload,
  })
}

beforeAll(async () => {
  handle = await buildTestApp()

  const superadmin = await createUser(handle.app, {
    role: 'superadmin',
    phone: '+77890000001',
    organizationId: null,
    name: 'Super',
  })
  superadminToken = await signTokenFor(handle.app, superadmin)

  const org = await createOrganization(handle.app, { name: 'Survey Org', bin: '690000000001' })
  const owner = await createUser(handle.app, {
    role: 'owner',
    phone: '+77890000002',
    organizationId: org.id,
    name: 'Owner',
  })
  ownerToken = await signTokenFor(handle.app, owner)

  const operator = await createUser(handle.app, {
    role: 'operator',
    phone: '+77890000003',
    organizationId: null,
    name: 'Op',
  })
  operatorToken = await signTokenFor(handle.app, operator)

  // Seed two test surveys: один active, один inactive — direct INSERT в БД
  // (тонкий test-fixture, без зависимости от seed-surveys.ts).
  const inserted = await handle.app.db.db
    .insert(surveys)
    .values([
      {
        slug: 'b2b-ru-test',
        title: 'Тестовый опрос',
        subtitle: 'Для тестов',
        audience: 'b2b',
        locale: 'ru',
        intro: 'Введение',
        outro: 'Спасибо',
        questionCount: 3,
        isActive: true,
      },
      {
        slug: 'inactive-test',
        title: 'Неактивный',
        subtitle: 'sub',
        audience: 'b2c',
        locale: 'ru',
        intro: 'i',
        outro: 'o',
        questionCount: 2,
        isActive: false,
      },
    ])
    .returning({ id: surveys.id, slug: surveys.slug })
  const active = inserted.find((r) => r.slug === 'b2b-ru-test')
  if (!active) throw new Error('failed to create test survey')
  testSurveyId = active.id

  await handle.app.db.db.insert(surveyQuestions).values([
    {
      surveyId: testSurveyId,
      position: 1,
      groupKey: 'context',
      groupTitle: 'Контекст',
      questionText: 'Сколько кранов работает?',
      isRequired: true,
    },
    {
      surveyId: testSurveyId,
      position: 2,
      groupKey: 'context',
      groupTitle: 'Контекст',
      questionText: 'Кто отвечает за координацию?',
      isRequired: true,
    },
    {
      surveyId: testSurveyId,
      position: 3,
      groupKey: 'pain',
      groupTitle: 'Боли',
      questionText: 'Что мешает работе?',
      isRequired: false,
    },
  ])

  const inactive = inserted.find((r) => r.slug === 'inactive-test')
  if (inactive) {
    await handle.app.db.db.insert(surveyQuestions).values([
      {
        surveyId: inactive.id,
        position: 1,
        groupKey: 'a',
        groupTitle: 'A',
        questionText: 'q1',
        isRequired: true,
      },
      {
        surveyId: inactive.id,
        position: 2,
        groupKey: 'a',
        groupTitle: 'A',
        questionText: 'q2',
        isRequired: true,
      },
    ])
  }
}, 60_000)

afterAll(async () => {
  await handle.close()
})

beforeEach(async () => {
  await handle.app.db.db.delete(surveyResponses).where(eq(surveyResponses.surveyId, testSurveyId))
})

describe('Public GET /api/v1/surveys/:slug', () => {
  it('returns active survey with ordered questions', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/surveys/b2b-ru-test',
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.slug).toBe('b2b-ru-test')
    expect(body.audience).toBe('b2b')
    expect(body.locale).toBe('ru')
    expect(body.questions).toHaveLength(3)
    expect(body.questions[0].position).toBe(1)
    expect(body.questions[0].groupKey).toBe('context')
    expect(body.questions[0].isRequired).toBe(true)
    expect(body.questions[2].isRequired).toBe(false)
  })

  it('returns 404 for inactive survey', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/surveys/inactive-test',
    })
    expect(res.statusCode).toBe(404)
    expect(res.json().error.code).toBe('SURVEY_NOT_FOUND')
  })

  it('returns 404 for unknown slug', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/surveys/does-not-exist',
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('Public POST /api/v1/surveys/:slug/responses — happy path', () => {
  it('stores valid submission and returns 201', async () => {
    const res = await submitResponse('b2b-ru-test', {
      fullName: 'Иван Иванов',
      phone: '+77001234567',
      email: 'ivan@example.kz',
      answers: { '1': 'Пять кранов', '2': 'Я лично', '3': 'Excel' },
    })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.id).toBeDefined()
    expect(body.submittedAt).toBeDefined()

    const stored = await handle.app.db.db
      .select()
      .from(surveyResponses)
      .where(eq(surveyResponses.id, body.id))
    expect(stored).toHaveLength(1)
    expect(stored[0]?.honeypotFilled).toBe(false)
    expect(stored[0]?.fullName).toBe('Иван Иванов')
    expect(stored[0]?.email).toBe('ivan@example.kz')
    expect(stored[0]?.answers).toEqual({ '1': 'Пять кранов', '2': 'Я лично', '3': 'Excel' })
  })

  it('captures IP and user agent', async () => {
    const res = await submitResponse(
      'b2b-ru-test',
      {
        fullName: 'Тест Пользователь',
        phone: '+77001234568',
        email: 'test@example.kz',
        answers: { '1': 'a', '2': 'b' },
      },
      { userAgent: 'TestBot/1.0' },
    )
    expect(res.statusCode).toBe(201)
    const stored = await handle.app.db.db
      .select()
      .from(surveyResponses)
      .where(eq(surveyResponses.id, res.json().id))
    expect(stored[0]?.userAgent).toBe('TestBot/1.0')
    expect(stored[0]?.ipAddress).toBeTruthy()
  })

  it('lowercases email', async () => {
    const res = await submitResponse('b2b-ru-test', {
      fullName: 'Имя Фамилия',
      phone: '+77001234569',
      email: 'MIXED@Case.KZ',
      answers: { '1': 'a', '2': 'b' },
    })
    expect(res.statusCode).toBe(201)
    const stored = await handle.app.db.db
      .select()
      .from(surveyResponses)
      .where(eq(surveyResponses.id, res.json().id))
    expect(stored[0]?.email).toBe('mixed@case.kz')
  })
})

describe('Public POST honeypot detection', () => {
  it('silently accepts honeypot-filled submission with marker', async () => {
    const res = await submitResponse('b2b-ru-test', {
      fullName: 'Bot Name',
      phone: '+77001234570',
      email: 'bot@spam.kz',
      answers: { '1': 'irrelevant' },
      honeypot: 'http://bot-filled-url',
    })
    expect(res.statusCode).toBe(201)
    const stored = await handle.app.db.db
      .select()
      .from(surveyResponses)
      .where(eq(surveyResponses.id, res.json().id))
    expect(stored[0]?.honeypotFilled).toBe(true)
  })

  it('honeypot bypass works even without all required answers', async () => {
    const res = await submitResponse('b2b-ru-test', {
      fullName: 'Bot Bot',
      phone: '+77001234571',
      email: 'b@b.kz',
      answers: { '99': 'x' },
      honeypot: 'gotcha',
    })
    expect(res.statusCode).toBe(201)
  })

  it('empty honeypot string treated as not filled', async () => {
    const res = await submitResponse('b2b-ru-test', {
      fullName: 'Реальный Юзер',
      phone: '+77001234572',
      email: 'real@user.kz',
      answers: { '1': 'a', '2': 'b' },
      honeypot: '',
    })
    expect(res.statusCode).toBe(201)
    const stored = await handle.app.db.db
      .select()
      .from(surveyResponses)
      .where(eq(surveyResponses.id, res.json().id))
    expect(stored[0]?.honeypotFilled).toBe(false)
  })
})

describe('Public POST validation', () => {
  it('rejects missing required answers', async () => {
    const res = await submitResponse('b2b-ru-test', {
      fullName: 'Иван Иванов',
      phone: '+77001234573',
      email: 'i@i.kz',
      answers: { '1': 'only one' },
    })
    expect(res.statusCode).toBe(422)
    expect(res.json().error.code).toBe('MISSING_REQUIRED_ANSWERS')
    expect(res.json().error.details.missingPositions).toContain(2)
  })

  it('rejects invalid phone format', async () => {
    const res = await submitResponse('b2b-ru-test', {
      fullName: 'Иван Иванов',
      phone: '87001234574',
      email: 'i@i.kz',
      answers: { '1': 'a', '2': 'b' },
    })
    expect(res.statusCode).toBe(422)
    expect(res.json().error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects invalid email', async () => {
    const res = await submitResponse('b2b-ru-test', {
      fullName: 'Иван Иванов',
      phone: '+77001234575',
      email: 'not-an-email',
      answers: { '1': 'a', '2': 'b' },
    })
    expect(res.statusCode).toBe(422)
    expect(res.json().error.code).toBe('VALIDATION_ERROR')
  })

  it('rejects too short fullName (< 2 chars after trim)', async () => {
    const res = await submitResponse('b2b-ru-test', {
      fullName: ' ',
      phone: '+77001234576',
      email: 'i@i.kz',
      answers: { '1': 'a', '2': 'b' },
    })
    expect(res.statusCode).toBe(422)
    expect(res.json().error.code).toBe('VALIDATION_ERROR')
  })

  it('returns 404 for non-existent survey on submit', async () => {
    const res = await submitResponse('no-such-survey', {
      fullName: 'Иван Иванов',
      phone: '+77001234577',
      email: 'i@i.kz',
      answers: { '1': 'a' },
    })
    expect(res.statusCode).toBe(404)
  })

  it('returns 404 for inactive survey on submit', async () => {
    const res = await submitResponse('inactive-test', {
      fullName: 'Иван Иванов',
      phone: '+77001234578',
      email: 'i@i.kz',
      answers: { '1': 'a', '2': 'b' },
    })
    expect(res.statusCode).toBe(404)
  })
})

describe('Admin GET /api/v1/admin/surveys', () => {
  it('lists all surveys including inactive', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/admin/surveys',
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(res.statusCode).toBe(200)
    const items = res.json() as Array<{ slug: string; isActive: boolean }>
    const slugs = items.map((i) => i.slug)
    expect(slugs).toContain('b2b-ru-test')
    expect(slugs).toContain('inactive-test')
    const inactive = items.find((i) => i.slug === 'inactive-test')
    expect(inactive?.isActive).toBe(false)
  })

  it('includes responseCount and latestResponseAt in list', async () => {
    await submitResponse('b2b-ru-test', {
      fullName: 'Counter Test',
      phone: '+77001234580',
      email: 'c@c.kz',
      answers: { '1': 'a', '2': 'b' },
    })
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/admin/surveys',
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    const items = res.json() as Array<{
      slug: string
      responseCount: number
      latestResponseAt: string | null
    }>
    const target = items.find((i) => i.slug === 'b2b-ru-test')
    expect(target).toBeDefined()
    expect(target?.responseCount).toBeGreaterThanOrEqual(1)
    expect(target?.latestResponseAt).toBeTruthy()
  })

  it('forbids owner role with 403', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/admin/surveys',
      headers: { authorization: `Bearer ${ownerToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('forbids operator role with 403', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/admin/surveys',
      headers: { authorization: `Bearer ${operatorToken}` },
    })
    expect(res.statusCode).toBe(403)
  })

  it('rejects unauthenticated request with 401', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/admin/surveys',
    })
    expect(res.statusCode).toBe(401)
  })
})

describe('Admin GET /api/v1/admin/surveys/:slug', () => {
  it('returns survey detail for inactive surveys (admin can see them)', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/admin/surveys/inactive-test',
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().isActive).toBe(false)
    expect(res.json().questions).toHaveLength(2)
  })
})

describe('Admin GET /api/v1/admin/surveys/:slug/responses', () => {
  beforeEach(async () => {
    await handle.app.db.db.insert(surveyResponses).values([
      {
        surveyId: testSurveyId,
        fullName: 'Алексей Excel-User',
        phone: '+77001110001',
        email: 'a@a.kz',
        answers: { '1': 'У меня всё в Excel', '2': 'Я сам', '3': '' },
        submittedAt: new Date('2026-04-20T10:00:00Z'),
      },
      {
        surveyId: testSurveyId,
        fullName: 'Болат',
        phone: '+77001110002',
        email: 'b@b.kz',
        answers: { '1': 'Десять кранов', '2': 'Диспетчер' },
        submittedAt: new Date('2026-04-21T10:00:00Z'),
      },
      {
        surveyId: testSurveyId,
        fullName: 'Spam Bot',
        phone: '+77001110003',
        email: 's@s.kz',
        answers: { '1': 'spam' },
        honeypotFilled: true,
        submittedAt: new Date('2026-04-22T10:00:00Z'),
      },
    ])
  })

  it('default excludes honeypot-flagged responses', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/admin/surveys/b2b-ru-test/responses',
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.items).toHaveLength(2)
    expect(body.items.some((i: { fullName: string }) => i.fullName === 'Spam Bot')).toBe(false)
  })

  it('includeSpam=true returns honeypot responses too', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/admin/surveys/b2b-ru-test/responses?includeSpam=true',
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    const body = res.json()
    expect(body.items).toHaveLength(3)
    expect(body.items.some((i: { honeypotFilled: boolean }) => i.honeypotFilled)).toBe(true)
  })

  it('search q filters by answer text (JSONB ILIKE)', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/admin/surveys/b2b-ru-test/responses?q=Excel',
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    const body = res.json()
    expect(body.items).toHaveLength(1)
    expect(body.items[0].fullName).toBe('Алексей Excel-User')
  })

  it('search q filters by fullName too', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/admin/surveys/b2b-ru-test/responses?q=Болат',
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(res.json().items).toHaveLength(1)
  })

  it('paginates with cursor (newest first)', async () => {
    const first = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/admin/surveys/b2b-ru-test/responses?limit=1',
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    const firstBody = first.json()
    expect(firstBody.items).toHaveLength(1)
    expect(firstBody.nextCursor).toBeTruthy()
    expect(firstBody.items[0].fullName).toBe('Болат') // newest non-spam

    const second = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/admin/surveys/b2b-ru-test/responses?limit=1&cursor=${encodeURIComponent(firstBody.nextCursor)}`,
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(second.statusCode).toBe(200)
    const secondBody = second.json()
    expect(secondBody.items).toHaveLength(1)
    expect(secondBody.items[0].fullName).toBe('Алексей Excel-User')
  })

  it('owner cannot list responses', async () => {
    const res = await handle.app.inject({
      method: 'GET',
      url: '/api/v1/admin/surveys/b2b-ru-test/responses',
      headers: { authorization: `Bearer ${ownerToken}` },
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('Admin GET /api/v1/admin/surveys/:slug/responses/:id', () => {
  it('returns full Q&A с group structure preserved', async () => {
    const inserted = await handle.app.db.db
      .insert(surveyResponses)
      .values({
        surveyId: testSurveyId,
        fullName: 'Detail Test',
        phone: '+77001110010',
        email: 'd@d.kz',
        answers: { '1': 'Ответ один', '2': 'Ответ два', '3': 'Ответ три' },
      })
      .returning({ id: surveyResponses.id })
    const id = inserted[0]?.id
    if (!id) throw new Error('failed to insert response')

    const res = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/admin/surveys/b2b-ru-test/responses/${id}`,
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.surveySlug).toBe('b2b-ru-test')
    expect(body.surveyTitle).toBe('Тестовый опрос')
    expect(body.fullName).toBe('Detail Test')
    expect(body.answers).toHaveLength(3)
    expect(body.answers[0]).toMatchObject({
      position: 1,
      groupKey: 'context',
      groupTitle: 'Контекст',
      questionText: 'Сколько кранов работает?',
      answer: 'Ответ один',
    })
    expect(body.answers[2].groupKey).toBe('pain')
  })

  it('returns 404 when response belongs к другому survey', async () => {
    const inserted = await handle.app.db.db
      .insert(surveyResponses)
      .values({
        surveyId: testSurveyId,
        fullName: 'Cross Test',
        phone: '+77001110011',
        email: 'x@x.kz',
        answers: { '1': 'a', '2': 'b' },
      })
      .returning({ id: surveyResponses.id })
    const id = inserted[0]?.id

    const res = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/admin/surveys/inactive-test/responses/${id}`,
      headers: { authorization: `Bearer ${superadminToken}` },
    })
    expect(res.statusCode).toBe(404)
  })

  it('owner forbidden for response detail', async () => {
    const inserted = await handle.app.db.db
      .insert(surveyResponses)
      .values({
        surveyId: testSurveyId,
        fullName: 'Forbidden Test',
        phone: '+77001110012',
        email: 'x@x.kz',
        answers: { '1': 'a', '2': 'b' },
      })
      .returning({ id: surveyResponses.id })
    const id = inserted[0]?.id

    const res = await handle.app.inject({
      method: 'GET',
      url: `/api/v1/admin/surveys/b2b-ru-test/responses/${id}`,
      headers: { authorization: `Bearer ${ownerToken}` },
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('Rate limiting (3 submissions per IP per 24h)', () => {
  it('returns 429 on 4th submission from the same IP', async () => {
    // Все четыре с одного фиксированного IP — отдельного от nextIp() серии,
    // чтобы rate-limit-store этого IP начал с нуля.
    const ip = '10.99.99.99'
    const submit = (n: number) =>
      submitResponse(
        'b2b-ru-test',
        {
          fullName: `RL Test ${n}`,
          phone: `+770022000${String(n).padStart(2, '0')}`,
          email: `rl${n}@x.kz`,
          answers: { '1': `a${n}`, '2': `b${n}` },
        },
        { ip },
      )

    const r1 = await submit(1)
    const r2 = await submit(2)
    const r3 = await submit(3)
    const r4 = await submit(4)
    expect(r1.statusCode).toBe(201)
    expect(r2.statusCode).toBe(201)
    expect(r3.statusCode).toBe(201)
    expect(r4.statusCode).toBe(429)
    expect(r4.json().error.code).toBe('RATE_LIMIT_EXCEEDED')
  })
})

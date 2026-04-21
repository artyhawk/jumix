import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type TestAppHandle, buildTestApp } from './helpers/build-test-app'

let handle: TestAppHandle

beforeAll(async () => {
  handle = await buildTestApp()
})

afterAll(async () => {
  await handle.close()
})

describe('health endpoints', () => {
  it('GET /health → 200 liveness', async () => {
    const res = await handle.app.inject({ method: 'GET', url: '/health' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ok', service: 'jumix-api' })
  })

  it('GET /health/ready → 200 при живой БД', async () => {
    const res = await handle.app.inject({ method: 'GET', url: '/health/ready' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual({ status: 'ready', checks: { db: 'ok' } })
  })

  it('GET /health/ready → 503 при закрытой БД', async () => {
    // Закрываем БД и проверяем что readiness даёт 503
    await handle.app.db.close()
    const res = await handle.app.inject({ method: 'GET', url: '/health/ready' })
    expect(res.statusCode).toBe(503)
    expect(res.json()).toEqual({ status: 'not_ready', checks: { db: 'down' } })
    // БД закрыта до конца test-file — afterAll уже вызовет close() повторно, это ок
  })
})

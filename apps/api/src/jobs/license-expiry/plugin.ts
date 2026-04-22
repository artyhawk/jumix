import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { LicenseExpiryWorker } from './worker'

/**
 * License-expiry job plugin (ADR 0005).
 *
 * Всегда декорирует `app.licenseExpiryWorker` — это plain-класс, его можно
 * вызывать из тестов напрямую (через `worker.process()`) и из admin-endpoint'а
 * (manual trigger — backlog).
 *
 * Cron через BullMQ регистрируется условно:
 *   - `app.bullmq === null` (нет REDIS_URL) — skip, worker работает только
 *     через прямой вызов;
 *   - `appEnv.DISABLE_CRONS === true` — skip (тестовый режим: Testcontainers
 *     без Redis, BullMQ на `add()` падает с connection error);
 *   - иначе — создаём queue + worker, регистрируем repeatable job на
 *     02:00 Asia/Almaty.
 *
 * Queue name 'license-expiry' — единственный в проекте пока; когда появятся
 * другие cron-джобы, каждому — свой namespace.
 */

const QUEUE_NAME = 'license-expiry'
const REPEATABLE_JOB_ID = 'license-expiry:daily'
const REPEATABLE_CRON = '0 2 * * *'
const REPEATABLE_TZ = 'Asia/Almaty'

const licenseExpiryJobPlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  const worker = new LicenseExpiryWorker(app.db, app.log)
  app.decorate('licenseExpiryWorker', worker)

  if (app.bullmq === null) {
    app.log.debug('license-expiry: bullmq disabled (no REDIS_URL), skip cron')
    return
  }
  if (app.appEnv.DISABLE_CRONS === true) {
    app.log.debug('license-expiry: DISABLE_CRONS set, skip cron')
    return
  }

  const queue = await app.bullmq.createQueue(QUEUE_NAME)
  await queue.add(
    REPEATABLE_JOB_ID,
    {},
    {
      repeat: { pattern: REPEATABLE_CRON, tz: REPEATABLE_TZ },
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 200 },
    },
  )

  await app.bullmq.createWorker(QUEUE_NAME, async () => {
    await worker.process()
  })

  app.log.info(
    { queue: QUEUE_NAME, cron: REPEATABLE_CRON, tz: REPEATABLE_TZ },
    'license-expiry cron registered',
  )
}

export default fp(licenseExpiryJobPlugin, {
  name: 'license-expiry-job',
  dependencies: ['bullmq'],
})

declare module 'fastify' {
  interface FastifyInstance {
    licenseExpiryWorker: LicenseExpiryWorker
  }
}

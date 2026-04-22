import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'

/**
 * BullMQ infrastructure plugin (ADR 0005).
 *
 * Регистрирует фабрики `createQueue` / `createWorker` с общим Redis-connection.
 * Если REDIS_URL не задан (dev без compose, test без контейнера) — декоратор
 * выставлен в `null`; зависимые плагины (license-expiry-job) должны это
 * проверять и skip'ать регистрацию cron'ов, иначе BullMQ падает с connection
 * error ещё на `add()`.
 *
 * Lifecycle:
 *  - Все созданные queues/workers регистрируются в onClose для graceful
 *    shutdown (чтобы node-процесс корректно завершался, не висел на open
 *    Redis-connections).
 *  - BullMQ не переиспользует app.redis: по docs require'а отдельный
 *    connection (Worker блокирует BRPOPLPUSH, блокирующие команды нельзя
 *    смешивать с pub/sub).
 *
 * Ленивый dynamic-import BullMQ — пакет тяжёлый, не нужен тестам; та же схема
 * что в plugins/redis.ts с ioredis, plugins/storage.ts с minio.
 */

type BullmqModule = typeof import('bullmq')
type Queue = import('bullmq').Queue
type Worker = import('bullmq').Worker
type QueueOptions = import('bullmq').QueueOptions
type WorkerOptions = import('bullmq').WorkerOptions
type Processor = import('bullmq').Processor

export interface BullmqDecorator {
  /**
   * Создать или вернуть уже созданную очередь с заданным name. Идемпотентно:
   * повторный вызов с тем же name возвращает ту же instance (важно для
   * модулей которые регистрируют queue + worker в одном plugin'е).
   */
  createQueue(name: string, opts?: Omit<QueueOptions, 'connection'>): Promise<Queue>

  /**
   * Запустить Worker на очереди. Caller отвечает за processor-логику.
   * Worker автоматически закрывается на onClose.
   */
  createWorker(
    name: string,
    processor: Processor,
    opts?: Omit<WorkerOptions, 'connection'>,
  ): Promise<Worker>
}

const bullmqPlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  const url = app.appEnv.REDIS_URL
  if (!url) {
    // Без Redis BullMQ не запустится. Зависимые plugins должны видеть null
    // и skip'ать регистрацию; тесты по-умолчанию идут этим путём.
    app.decorate('bullmq', null as BullmqDecorator | null)
    return
  }

  // Dynamic import чтобы BullMQ не попадал в тестовый граф. Peer-dep ioredis
  // уже подключается через redis-plugin (тоже lazy).
  const bullmqModuleName = 'bullmq'
  const mod = (await import(bullmqModuleName).catch(() => {
    throw new Error('REDIS_URL set but `bullmq` is not installed')
  })) as BullmqModule

  const queues = new Map<string, Queue>()
  const workers: Worker[] = []

  const connection = { url }

  const decorator: BullmqDecorator = {
    async createQueue(name, opts) {
      const existing = queues.get(name)
      if (existing) return existing
      const queue = new mod.Queue(name, { ...opts, connection })
      queues.set(name, queue)
      return queue
    },
    async createWorker(name, processor, opts) {
      const worker = new mod.Worker(name, processor, { ...opts, connection })
      workers.push(worker)
      return worker
    },
  }

  app.decorate('bullmq', decorator)

  app.addHook('onClose', async () => {
    await Promise.all(workers.map((w) => w.close()))
    await Promise.all([...queues.values()].map((q) => q.close()))
  })
}

export default fp(bullmqPlugin, { name: 'bullmq' })

declare module 'fastify' {
  interface FastifyInstance {
    bullmq: BullmqDecorator | null
  }
}

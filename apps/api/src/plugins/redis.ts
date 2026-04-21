import type { RedisLikeClient } from '@jumix/auth'
import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'

/**
 * Опциональный Redis-клиент для rate-limit / очередей BullMQ / SMS-cooldown.
 *
 * Плагин регистрируется только если REDIS_URL задан. Остальные модули
 * должны проверять `app.redis` на null и падать обратно на MemoryRateLimiter
 * (см. rate-limit handlers, §5.3). В production REDIS_URL обязателен —
 * это валидируется в server.ts перед вызовом buildApp.
 *
 * Без жёсткой зависимости на конкретного клиента: тип RedisLikeClient из
 * @jumix/auth задан минимально (eval/zremrangebyscore/zadd/zcard/expire),
 * подойдёт ioredis, node-redis v4+ с обёрткой.
 *
 * Ленивая установка ioredis: если REDIS_URL задан, а ioredis не
 * установлен в окружении — explicit throw, чтобы caller видел что забыл.
 */
type IORedisCtor = new (url: string) => RedisLikeClient & { quit(): Promise<string> }

const redisPlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  const url = app.appEnv.REDIS_URL
  if (!url) {
    app.decorate('redis', null as RedisLikeClient | null)
    return
  }

  // Dynamic import: ioredis не в прямых зависимостях apps/api, подключается
  // только если проект реально использует Redis. В prod у нас он есть —
  // валидируется в server.ts через REDIS_URL-guard. В test/dev обычно null.
  // String-variable импорт чтобы не ломать type-check при отсутствии пакета.
  const ioredisModuleName = 'ioredis'
  const mod = (await import(ioredisModuleName).catch(() => {
    throw new Error('REDIS_URL set but `ioredis` is not installed')
  })) as { default: IORedisCtor }

  const client = new mod.default(url)

  app.decorate('redis', client)
  app.addHook('onClose', async () => {
    await client.quit()
  })
}

export default fp(redisPlugin, { name: 'redis' })

declare module 'fastify' {
  interface FastifyInstance {
    redis: RedisLikeClient | null
  }
}

import { createDatabase } from '@jumix/db'
import { buildApp } from './app'
import { loadEnv } from './config/env'

/**
 * Production entrypoint.
 *
 * Порядок:
 *  1. Валидация env (fail-fast).
 *  2. Создание БД-клиента.
 *  3. Сборка Fastify-инстанса через buildApp().
 *  4. listen() на HOST:PORT.
 *  5. Регистрация SIGTERM/SIGINT handlers (CLAUDE.md §10.3):
 *     app.close() → db.close() → process.exit(0).
 */
async function main(): Promise<void> {
  const env = loadEnv()
  const database = createDatabase({
    url: env.DATABASE_URL,
    max: env.NODE_ENV === 'production' ? 20 : 10,
    debug: env.NODE_ENV === 'development' && env.LOG_LEVEL === 'debug',
  })

  const app = await buildApp({ env, database })

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down')
    try {
      await app.close()
      await database.close()
      process.exit(0)
    } catch (err) {
      app.log.error({ err }, 'shutdown failed')
      process.exit(1)
    }
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))

  try {
    await app.listen({ host: env.HOST, port: env.PORT })
  } catch (err) {
    app.log.fatal({ err }, 'failed to start')
    process.exit(1)
  }
}

void main()

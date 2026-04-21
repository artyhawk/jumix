import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDatabase } from '@jumix/db'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../src/app'
import type { Env } from '../../src/config/env'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const MIGRATIONS_DIR = path.resolve(__dirname, '../../../../packages/db/migrations')

export type TestAppHandle = {
  app: FastifyInstance
  container: StartedPostgreSqlContainer
  databaseUrl: string
  close(): Promise<void>
}

/**
 * Поднимает Postgres через Testcontainers, прогоняет миграции, собирает Fastify app.
 * Тестовый logger отключён (NODE_ENV=test).
 *
 * Вызывается в beforeAll каждого integration-теста. Тяжёлая операция
 * (~5-10 сек на старт контейнера), поэтому одна per test-file.
 */
export async function buildTestApp(overrides: Partial<Env> = {}): Promise<TestAppHandle> {
  const container = await new PostgreSqlContainer('postgis/postgis:16-3.4-alpine')
    .withDatabase('jumix_test')
    .withUsername('jumix_test')
    .withPassword('jumix_test')
    .start()

  const databaseUrl = container.getConnectionUri()

  const bootstrap = createDatabase({ url: databaseUrl, max: 2 })
  await runMigrations(bootstrap.sql)
  await bootstrap.close()

  const database = createDatabase({ url: databaseUrl, max: 5 })

  const env: Env = {
    NODE_ENV: 'test',
    PORT: 0,
    HOST: '127.0.0.1',
    LOG_LEVEL: 'silent',
    DATABASE_URL: databaseUrl,
    CORS_ORIGINS: [],
    ...overrides,
  }

  const app = await buildApp({ env, database })

  return {
    app,
    container,
    databaseUrl,
    async close() {
      await app.close()
      await database.close()
      await container.stop()
    },
  }
}

async function runMigrations(sql: ReturnType<typeof createDatabase>['sql']): Promise<void> {
  // drizzle-orm/postgres-js/migrator ожидает папку, но в ESM + tsx монорепе
  // путь может не резолвиться корректно; применяем SQL-файлы вручную по порядку.
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()

  for (const file of files) {
    const migration = readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8')
    const statements = migration
      .split('--> statement-breakpoint')
      .map((s) => s.trim())
      .filter(Boolean)
    for (const stmt of statements) {
      await sql.unsafe(stmt)
    }
  }
}

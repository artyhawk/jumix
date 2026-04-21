import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from './schema/index'

export type DatabaseClient = ReturnType<typeof createDatabase>

export interface CreateDatabaseOptions {
  url: string
  /** Максимум одновременных соединений в пуле. Дефолт 10 для dev, 20 для prod. */
  max?: number
  /** Чувствительные SQL-логи только в dev. */
  debug?: boolean
}

export function createDatabase(options: CreateDatabaseOptions) {
  const sql = postgres(options.url, {
    max: options.max ?? 10,
    // Чтобы timestamp returned как native Date (не BigInt / string)
    types: {},
    onnotice: () => {},
    debug: options.debug ? (_, query) => console.warn('[sql]', query) : undefined,
  })

  const db = drizzle(sql, { schema, casing: 'snake_case' })

  return {
    db,
    sql,
    async close() {
      await sql.end({ timeout: 5 })
    },
  }
}

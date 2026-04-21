import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { config as loadEnv } from 'dotenv'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { createDatabase } from './client'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

loadEnv({ path: path.resolve(__dirname, '../../../.env') })

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('DATABASE_URL не задан')
    process.exit(1)
  }

  const { db, close } = createDatabase({ url: databaseUrl, max: 1 })
  const migrationsFolder = path.resolve(__dirname, '../migrations')

  console.warn(`[migrate] applying migrations from ${migrationsFolder}`)
  await migrate(db, { migrationsFolder })
  console.warn('[migrate] done')

  await close()
}

main().catch((err) => {
  console.error('[migrate] failed', err)
  process.exit(1)
})

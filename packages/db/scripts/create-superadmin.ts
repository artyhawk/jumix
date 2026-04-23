import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import argon2 from 'argon2'
import { config as loadEnv } from 'dotenv'
import { createDatabase } from '../src/client'
import { users } from '../src/schema/index'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

loadEnv({ path: path.resolve(__dirname, '../../../.env') })
loadEnv({ path: path.resolve(__dirname, '../../../.env.prod'), override: false })

/**
 * Admin CLI — создаёт первого superadmin'а в БД (B3-UI-5c).
 *
 * Usage (dev):
 *   pnpm --filter @jumix/db tsx scripts/create-superadmin.ts \
 *     --phone=+77001112233 --name="Админ" --password=StrongPass123!
 *
 * Usage (prod — внутри api container):
 *   docker compose -f infra/docker/docker-compose.prod.yml exec api \
 *     node --import tsx/esm ../../packages/db/scripts/create-superadmin.ts \
 *     --phone=+77001234567 --name="Админ" --password=...
 *
 * Создаёт user с role=superadmin + argon2id password hash + phoneVerified=true
 * (passes login immediately). Если phone уже существует — 409 + exit 1.
 *
 * Normal flow не имеет "create superadmin" UI — самого первого superadmin'а
 * надо bootstrap'ить через backend. Все последующие operations через web:
 * superadmin создаёт organizations с owner'ами → owner логинится → etc.
 */

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
}

const PHONE_RE = /^\+7[0-9]{10}$/

async function main() {
  const { values } = parseArgs({
    options: {
      phone: { type: 'string' },
      name: { type: 'string' },
      password: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
    strict: true,
  })

  if (values.help || !values.phone || !values.name || !values.password) {
    console.error(`
Usage:
  pnpm --filter @jumix/db tsx scripts/create-superadmin.ts \\
    --phone=+77001234567 \\
    --name="Иванов Иван Иванович" \\
    --password="StrongPass123!"

Required flags:
  --phone     KZ format (+7 + 10 digits)
  --name      Display name
  --password  Min 10 chars recommended
`)
    process.exit(values.help ? 0 : 2)
  }

  const phone = values.phone
  const name = values.name
  const password = values.password

  if (!PHONE_RE.test(phone)) {
    console.error(`error: invalid phone format "${phone}" (expected +7XXXXXXXXXX)`)
    process.exit(1)
  }
  if (password.length < 10) {
    console.error('error: password must be at least 10 chars')
    process.exit(1)
  }

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('error: DATABASE_URL not set (check .env или .env.prod)')
    process.exit(1)
  }

  const { db, close } = createDatabase({ url: databaseUrl, max: 2 })
  try {
    const passwordHash = await argon2.hash(password, ARGON2_OPTIONS)
    const inserted = await db
      .insert(users)
      .values({
        phone,
        passwordHash,
        role: 'superadmin',
        organizationId: null,
        name,
        status: 'active',
      })
      .returning({ id: users.id, phone: users.phone, role: users.role })

    const row = inserted[0]
    if (!row) throw new Error('insert returned no rows')

    console.warn('[ok] superadmin created:')
    console.warn(`     id:    ${row.id}`)
    console.warn(`     phone: ${row.phone}`)
    console.warn(`     role:  ${row.role}`)
    console.warn('     Login: открыть /login → ввести phone + password')
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === '23505') {
      console.error(`error: phone "${phone}" already exists in users table`)
      process.exit(1)
    }
    throw err
  } finally {
    await close()
  }
}

main().catch((err) => {
  console.error('[create-superadmin] failed:', err)
  process.exit(1)
})

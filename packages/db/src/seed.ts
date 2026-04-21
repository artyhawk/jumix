import path from 'node:path'
import { fileURLToPath } from 'node:url'
import argon2 from 'argon2'
import { config as loadEnv } from 'dotenv'
import { createDatabase } from './client'
import { organizations, users } from './schema/index'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

loadEnv({ path: path.resolve(__dirname, '../../../.env') })

/**
 * Dev seed: минимальный набор учёток для локальной разработки.
 * Пароли дефолтные — ТОЛЬКО для dev. В prod этот скрипт не вызывается.
 */
const SEED_PASSWORD = 'JumixDev123!'

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MiB — OWASP minimum
  timeCost: 2,
  parallelism: 1,
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    console.error('DATABASE_URL не задан')
    process.exit(1)
  }

  const { db, close } = createDatabase({ url: databaseUrl, max: 2 })
  const passwordHash = await argon2.hash(SEED_PASSWORD, ARGON2_OPTIONS)

  console.warn('[seed] clearing existing rows')
  // Порядок важен: FK cascades позаботятся, но явно надёжнее
  await db.delete(users)
  await db.delete(organizations)

  console.warn('[seed] creating organizations')
  const [orgA, orgB] = await db
    .insert(organizations)
    .values([
      {
        name: 'ТОО «Крановый Парк Алматы»',
        bin: '123456789012',
        contactName: 'Асылбек Темирханов',
        contactPhone: '+77010001122',
        contactEmail: 'info@kranpark.kz',
      },
      {
        name: 'ТОО «Башкран Юг»',
        bin: '210987654321',
        contactName: 'Ерлан Оспанов',
        contactPhone: '+77020003344',
        contactEmail: 'office@bashkran.kz',
      },
    ])
    .returning()

  if (!orgA || !orgB) throw new Error('[seed] organizations insert failed')

  console.warn('[seed] creating users')
  await db.insert(users).values([
    {
      phone: '+77001112233',
      passwordHash,
      role: 'superadmin',
      organizationId: null,
      name: 'Платформенный администратор',
    },
    {
      phone: '+77010001122',
      passwordHash,
      role: 'owner',
      organizationId: orgA.id,
      name: 'Асылбек Темирханов',
    },
    {
      phone: '+77020003344',
      passwordHash,
      role: 'owner',
      organizationId: orgB.id,
      name: 'Ерлан Оспанов',
    },
  ])

  console.warn('[seed] done')
  console.warn('')
  console.warn('  superadmin phone: +77001112233')
  console.warn('  owner A phone:    +77010001122  (ТОО «Крановый Парк Алматы»)')
  console.warn('  owner B phone:    +77020003344  (ТОО «Башкран Юг»)')
  console.warn(`  password:         ${SEED_PASSWORD}`)
  console.warn('')

  await close()
}

main().catch((err) => {
  console.error('[seed] failed', err)
  process.exit(1)
})

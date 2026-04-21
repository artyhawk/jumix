import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { type DatabaseClient, createDatabase } from '../src/client'
import { auditLog, organizations, refreshTokens, users } from '../src/schema/index'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const migrationsFolder = path.resolve(__dirname, '../migrations')

let container: StartedPostgreSqlContainer
let client: DatabaseClient

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgis/postgis:16-3.4-alpine')
    .withDatabase('jumix_test')
    .withUsername('jumix_test')
    .withPassword('jumix_test_pwd')
    .start()

  const url = container.getConnectionUri()
  client = createDatabase({ url, max: 2 })
  await migrate(client.db, { migrationsFolder })
})

afterAll(async () => {
  await client?.close()
  await container?.stop()
})

describe('auth schema', () => {
  test('создаёт organization и возвращает её с defaults', async () => {
    const [org] = await client.db
      .insert(organizations)
      .values({
        name: 'ТОО «Тестовый Кран»',
        bin: '111222333444',
        contactName: 'Test Contact',
      })
      .returning()

    expect(org).toBeDefined()
    expect(org?.status).toBe('active')
    expect(org?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}/)
    expect(org?.createdAt).toBeInstanceOf(Date)
  })

  test('CHECK: BIN должен быть 12 цифр', async () => {
    await expect(
      client.db.insert(organizations).values({
        name: 'Bad',
        bin: '12345', // слишком короткий
      }),
    ).rejects.toThrow(/organizations_bin_format_chk/)
  })

  test('CHECK: phone должен быть +7XXXXXXXXXX', async () => {
    const [org] = await client.db
      .insert(organizations)
      .values({ name: 'Org', bin: '999888777666' })
      .returning()

    await expect(
      client.db.insert(users).values({
        phone: '+1234567890', // не KZ
        role: 'owner',
        organizationId: org!.id,
        name: 'X',
      }),
    ).rejects.toThrow(/users_phone_format_chk/)
  })

  test('CHECK: superadmin без org, owner с org', async () => {
    const [org] = await client.db
      .insert(organizations)
      .values({ name: 'Org2', bin: '555444333222' })
      .returning()

    // superadmin с organization_id — должен упасть
    await expect(
      client.db.insert(users).values({
        phone: '+77050000001',
        role: 'superadmin',
        organizationId: org!.id,
        name: 'Bad admin',
      }),
    ).rejects.toThrow(/users_org_role_consistency_chk/)

    // owner без organization_id — должен упасть
    await expect(
      client.db.insert(users).values({
        phone: '+77050000002',
        role: 'owner',
        organizationId: null,
        name: 'Orphan owner',
      }),
    ).rejects.toThrow(/users_org_role_consistency_chk/)

    // оба валидных варианта проходят
    const inserted = await client.db
      .insert(users)
      .values([
        { phone: '+77050000003', role: 'superadmin', organizationId: null, name: 'OK admin' },
        { phone: '+77050000004', role: 'owner', organizationId: org!.id, name: 'OK owner' },
      ])
      .returning()

    expect(inserted).toHaveLength(2)
  })

  test('FK cascade: удаление user удаляет его refresh_tokens', async () => {
    const [org] = await client.db
      .insert(organizations)
      .values({ name: 'Org3', bin: '000111222333' })
      .returning()

    const [user] = await client.db
      .insert(users)
      .values({
        phone: '+77060000001',
        role: 'owner',
        organizationId: org!.id,
        name: 'Cascade Test',
      })
      .returning()

    await client.db.insert(refreshTokens).values({
      userId: user!.id,
      tokenHash: Buffer.from('a'.repeat(64), 'hex'),
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    })

    const before = await client.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.userId, user!.id))
    expect(before).toHaveLength(1)

    await client.db.delete(users).where(eq(users.id, user!.id))

    const after = await client.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.userId, user!.id))
    expect(after).toHaveLength(0)
  })

  test('audit_log принимает null actor и organization (system event)', async () => {
    const [entry] = await client.db
      .insert(auditLog)
      .values({
        action: 'system.startup',
        actorUserId: null,
        actorRole: null,
        organizationId: null,
        metadata: { version: '0.0.0' },
      })
      .returning()

    expect(entry?.id).toBeDefined()
    expect(entry?.metadata).toEqual({ version: '0.0.0' })
  })

  test('refresh_tokens: token_hash unique', async () => {
    const [org] = await client.db
      .insert(organizations)
      .values({ name: 'Org4', bin: '999000111222' })
      .returning()

    const [user] = await client.db
      .insert(users)
      .values({
        phone: '+77070000001',
        role: 'owner',
        organizationId: org!.id,
        name: 'Dup Test',
      })
      .returning()

    const sameHash = Buffer.from('b'.repeat(64), 'hex')
    await client.db.insert(refreshTokens).values({
      userId: user!.id,
      tokenHash: sameHash,
      expiresAt: new Date(Date.now() + 1000 * 60),
    })

    await expect(
      client.db.insert(refreshTokens).values({
        userId: user!.id,
        tokenHash: sameHash,
        expiresAt: new Date(Date.now() + 1000 * 60),
      }),
    ).rejects.toThrow(/refresh_tokens_hash_key/)
  })
})

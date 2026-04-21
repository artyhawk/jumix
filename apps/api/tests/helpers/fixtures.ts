import { type SignAccessInput, signAccessToken } from '@jumix/auth'
import { type NewOrganization, type NewUser, organizations, users } from '@jumix/db'
import type { FastifyInstance } from 'fastify'

/**
 * Test fixtures: поднять организации/пользователей в Testcontainers DB
 * и выписать валидные access-токены через тот же keypair, что app использует.
 *
 * Используем напрямую `app.db` и `app.jwtConfig` — один source of truth
 * с production кодом (никакого mock'анья).
 */

export async function createOrganization(
  app: FastifyInstance,
  overrides: Partial<NewOrganization> = {},
): Promise<{ id: string; status: 'active' | 'suspended' | 'archived' }> {
  const rows = await app.db.db
    .insert(organizations)
    .values({
      name: overrides.name ?? 'Test Org',
      bin: overrides.bin ?? '123456789012',
      status: overrides.status ?? 'active',
      ...overrides,
    })
    .returning({ id: organizations.id, status: organizations.status })
  const row = rows[0]
  if (!row) throw new Error('org insert failed')
  return row
}

export type CreatedUser = {
  id: string
  role: NewUser['role']
  organizationId: string | null
  tokenVersion: number
}

export async function createUser(
  app: FastifyInstance,
  overrides: Partial<NewUser> & { role: NewUser['role']; phone: string },
): Promise<CreatedUser> {
  const rows = await app.db.db
    .insert(users)
    .values({
      name: overrides.name ?? 'Test User',
      status: overrides.status ?? 'active',
      tokenVersion: overrides.tokenVersion ?? 0,
      ...overrides,
    })
    .returning({
      id: users.id,
      role: users.role,
      organizationId: users.organizationId,
      tokenVersion: users.tokenVersion,
    })
  const row = rows[0]
  if (!row) throw new Error('user insert failed')
  return row
}

export async function signTokenFor(
  app: FastifyInstance,
  user: CreatedUser,
  overrides: Partial<SignAccessInput> = {},
): Promise<string> {
  return signAccessToken(
    {
      userId: user.id,
      organizationId: user.organizationId,
      role: user.role,
      tokenVersion: user.tokenVersion,
      ...overrides,
    },
    app.jwtConfig,
  )
}

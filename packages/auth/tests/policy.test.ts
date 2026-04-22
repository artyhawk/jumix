import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  type AuthContext,
  isOperator,
  isOwner,
  isSelf,
  isSuperadmin,
  sameOrganization,
  tenantListScope,
} from '../src'

const superadmin = (): AuthContext => ({
  role: 'superadmin',
  userId: randomUUID(),
  organizationId: null,
  tokenVersion: 0,
})

const owner = (orgId = randomUUID()): AuthContext => ({
  role: 'owner',
  userId: randomUUID(),
  organizationId: orgId,
  tokenVersion: 0,
})

// B2d-1 (ADR 0003): operator AuthContext больше не несёт organizationId
// (M:N через organization_operators). Параметр orgId сохраняем сигнатурно
// для будущих тестов, но игнорируем.
const operator = (_orgId = randomUUID()): AuthContext => ({
  role: 'operator',
  userId: randomUUID(),
  tokenVersion: 0,
})

describe('policy helpers', () => {
  it('isSuperadmin / isOwner / isOperator', () => {
    expect(isSuperadmin(superadmin())).toBe(true)
    expect(isOwner(owner())).toBe(true)
    expect(isOperator(operator())).toBe(true)
    expect(isSuperadmin(owner())).toBe(false)
    expect(isOwner(operator())).toBe(false)
    expect(isOperator(superadmin())).toBe(false)
  })

  it('sameOrganization: superadmin никогда не matches (org=null)', () => {
    const sa = superadmin()
    expect(sameOrganization(sa, randomUUID())).toBe(false)
  })

  it('sameOrganization: owner matches только свою orgId', () => {
    const orgA = randomUUID()
    const orgB = randomUUID()
    const ctx = owner(orgA)
    expect(sameOrganization(ctx, orgA)).toBe(true)
    expect(sameOrganization(ctx, orgB)).toBe(false)
  })

  it('isSelf: true только если userId совпадает', () => {
    const ctx = owner()
    expect(isSelf(ctx, ctx.userId)).toBe(true)
    expect(isSelf(ctx, randomUUID())).toBe(false)
  })

  it('tenantListScope: superadmin → all', () => {
    expect(tenantListScope(superadmin())).toEqual({ type: 'all' })
  })

  it('tenantListScope: owner → by_org', () => {
    const orgId = randomUUID()
    expect(tenantListScope(owner(orgId))).toEqual({ type: 'by_org', organizationId: orgId })
  })

  it('tenantListScope: operator → by_crane_profile (ADR 0003)', () => {
    const ctx = operator()
    expect(tenantListScope(ctx)).toEqual({ type: 'by_crane_profile', userId: ctx.userId })
  })
})

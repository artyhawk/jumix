import type { AuthContext } from '@jumix/auth'
import type { Operator } from '@jumix/db'
import { describe, expect, it } from 'vitest'
import { operatorPolicy } from '../src/modules/operator/operator.policy'

/**
 * Unit-тесты чистых функций operatorPolicy. БД/fastify не трогают, только
 * AuthContext + минимальный Pick<Operator>. Цель — зафиксировать матрицу прав:
 * admin-scope (canList/canRead/canCreate/canUpdate/canChangeStatus/canDelete)
 * и self-scope (canReadSelf/canUpdateSelf, где canReadSelf живёт для всех
 * статусов, а canUpdateSelf требует status='active').
 */

const userA = '00000000-0000-0000-0000-000000000001'
const userB = '00000000-0000-0000-0000-000000000002'
const orgA = '00000000-0000-0000-0000-00000000aaaa'
const orgB = '00000000-0000-0000-0000-00000000bbbb'

const superadmin: AuthContext = {
  userId: '00000000-0000-0000-0000-00000000ffff',
  role: 'superadmin',
  organizationId: null,
  tokenVersion: 0,
}
const ownerA: AuthContext = {
  userId: '00000000-0000-0000-0000-00000000000a',
  role: 'owner',
  organizationId: orgA,
  tokenVersion: 0,
}
const ownerB: AuthContext = {
  userId: '00000000-0000-0000-0000-00000000000b',
  role: 'owner',
  organizationId: orgB,
  tokenVersion: 0,
}
// B2d-1 (ADR 0003): operator AuthContext больше не несёт organizationId.
const operatorA: AuthContext = {
  userId: userA,
  role: 'operator',
  tokenVersion: 0,
}
const operatorB: AuthContext = {
  userId: userB,
  role: 'operator',
  tokenVersion: 0,
}

const opInOrgA: Pick<Operator, 'organizationId' | 'userId' | 'status'> = {
  organizationId: orgA,
  userId: userA,
  status: 'active',
}
const opInOrgB: Pick<Operator, 'organizationId' | 'userId' | 'status'> = {
  organizationId: orgB,
  userId: userB,
  status: 'active',
}

describe('operatorPolicy.canList', () => {
  it('superadmin can list', () => {
    expect(operatorPolicy.canList(superadmin)).toBe(true)
  })
  it('owner can list', () => {
    expect(operatorPolicy.canList(ownerA)).toBe(true)
  })
  it('operator cannot list', () => {
    expect(operatorPolicy.canList(operatorA)).toBe(false)
  })
})

describe('operatorPolicy.canRead', () => {
  it('superadmin can read any operator', () => {
    expect(operatorPolicy.canRead(superadmin, opInOrgA)).toBe(true)
    expect(operatorPolicy.canRead(superadmin, opInOrgB)).toBe(true)
  })

  it('owner can read own-org operator', () => {
    expect(operatorPolicy.canRead(ownerA, opInOrgA)).toBe(true)
  })

  it('owner cannot read foreign-org operator', () => {
    expect(operatorPolicy.canRead(ownerA, opInOrgB)).toBe(false)
    expect(operatorPolicy.canRead(ownerB, opInOrgA)).toBe(false)
  })

  it('operator can read own profile (userId match)', () => {
    expect(operatorPolicy.canRead(operatorA, opInOrgA)).toBe(true)
  })

  it('operator cannot read another operator with different userId', () => {
    expect(operatorPolicy.canRead(operatorA, opInOrgB)).toBe(false)
    expect(operatorPolicy.canRead(operatorB, opInOrgA)).toBe(false)
  })
})

describe('operatorPolicy.canCreate', () => {
  it('only owner can create', () => {
    expect(operatorPolicy.canCreate(ownerA)).toBe(true)
    expect(operatorPolicy.canCreate(superadmin)).toBe(false)
    expect(operatorPolicy.canCreate(operatorA)).toBe(false)
  })
})

describe('operatorPolicy.canUpdate', () => {
  it('superadmin can update any operator', () => {
    expect(operatorPolicy.canUpdate(superadmin, opInOrgA)).toBe(true)
    expect(operatorPolicy.canUpdate(superadmin, opInOrgB)).toBe(true)
  })
  it('owner can update own-org only', () => {
    expect(operatorPolicy.canUpdate(ownerA, opInOrgA)).toBe(true)
    expect(operatorPolicy.canUpdate(ownerA, opInOrgB)).toBe(false)
  })
  it('operator cannot update (admin path)', () => {
    expect(operatorPolicy.canUpdate(operatorA, opInOrgA)).toBe(false)
  })
})

describe('operatorPolicy.canChangeStatus', () => {
  it('superadmin can change status anywhere', () => {
    expect(operatorPolicy.canChangeStatus(superadmin, opInOrgA)).toBe(true)
    expect(operatorPolicy.canChangeStatus(superadmin, opInOrgB)).toBe(true)
  })
  it('owner only own-org', () => {
    expect(operatorPolicy.canChangeStatus(ownerA, opInOrgA)).toBe(true)
    expect(operatorPolicy.canChangeStatus(ownerA, opInOrgB)).toBe(false)
  })
  it('operator cannot change status', () => {
    expect(operatorPolicy.canChangeStatus(operatorA, opInOrgA)).toBe(false)
  })
})

describe('operatorPolicy.canDelete', () => {
  it('superadmin can delete anywhere', () => {
    expect(operatorPolicy.canDelete(superadmin, opInOrgA)).toBe(true)
  })
  it('owner own-org only', () => {
    expect(operatorPolicy.canDelete(ownerA, opInOrgA)).toBe(true)
    expect(operatorPolicy.canDelete(ownerA, opInOrgB)).toBe(false)
  })
  it('operator cannot delete', () => {
    expect(operatorPolicy.canDelete(operatorA, opInOrgA)).toBe(false)
  })
})

describe('operatorPolicy.canReadSelf', () => {
  it('operator with userId match can read self — active', () => {
    expect(operatorPolicy.canReadSelf(operatorA, { userId: userA })).toBe(true)
  })
  it('operator with userId match can read self — blocked (PDL РК)', () => {
    expect(operatorPolicy.canReadSelf(operatorA, { userId: userA })).toBe(true)
  })
  it('operator with userId match can read self — terminated (PDL РК)', () => {
    expect(operatorPolicy.canReadSelf(operatorA, { userId: userA })).toBe(true)
  })
  it('operator with different userId cannot read', () => {
    expect(operatorPolicy.canReadSelf(operatorA, { userId: userB })).toBe(false)
  })
  it('owner cannot use canReadSelf', () => {
    expect(operatorPolicy.canReadSelf(ownerA, { userId: userA })).toBe(false)
  })
  it('superadmin cannot use canReadSelf', () => {
    expect(operatorPolicy.canReadSelf(superadmin, { userId: userA })).toBe(false)
  })
})

describe('operatorPolicy.canUpdateSelf', () => {
  it('operator active can update self', () => {
    expect(operatorPolicy.canUpdateSelf(operatorA, { userId: userA, status: 'active' })).toBe(true)
  })
  it('operator blocked cannot update self', () => {
    expect(operatorPolicy.canUpdateSelf(operatorA, { userId: userA, status: 'blocked' })).toBe(
      false,
    )
  })
  it('operator terminated cannot update self', () => {
    expect(operatorPolicy.canUpdateSelf(operatorA, { userId: userA, status: 'terminated' })).toBe(
      false,
    )
  })
  it('operator with different userId cannot update', () => {
    expect(operatorPolicy.canUpdateSelf(operatorA, { userId: userB, status: 'active' })).toBe(false)
  })
  it('owner cannot use canUpdateSelf', () => {
    expect(operatorPolicy.canUpdateSelf(ownerA, { userId: userA, status: 'active' })).toBe(false)
  })
  it('superadmin cannot use canUpdateSelf', () => {
    expect(operatorPolicy.canUpdateSelf(superadmin, { userId: userA, status: 'active' })).toBe(
      false,
    )
  })
})

import type { AuthContext } from '@jumix/auth'
import type { OrganizationOperator } from '@jumix/db'
import { describe, expect, it } from 'vitest'
import { organizationOperatorPolicy } from '../src/modules/organization-operator/organization-operator.policy'

/**
 * Unit-тесты organizationOperatorPolicy (ADR 0003 pipeline 2 + authorization.md §4.2b).
 * БД/fastify не трогают — только AuthContext + Pick<OrganizationOperator>.
 *
 * Матрица прав:
 *   - canList/canRead/canCreate/canDelete — admin-scope + 404-over-403 в service;
 *   - canUpdate блокирует rejected (read-only после отказа, §4.2b);
 *   - canChangeStatus требует approval_status='approved' (pending/rejected → false);
 *   - canApprove/canReject — строго superadmin (holding-approval invariant: owner
 *     не одобряет собственные заявки).
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

const approvedInOrgA: Pick<OrganizationOperator, 'organizationId' | 'approvalStatus'> = {
  organizationId: orgA,
  approvalStatus: 'approved',
}
const approvedInOrgB: Pick<OrganizationOperator, 'organizationId' | 'approvalStatus'> = {
  organizationId: orgB,
  approvalStatus: 'approved',
}
const pendingInOrgA: Pick<OrganizationOperator, 'organizationId' | 'approvalStatus'> = {
  organizationId: orgA,
  approvalStatus: 'pending',
}
const rejectedInOrgA: Pick<OrganizationOperator, 'organizationId' | 'approvalStatus'> = {
  organizationId: orgA,
  approvalStatus: 'rejected',
}

describe('organizationOperatorPolicy.canList', () => {
  it('superadmin can list', () => {
    expect(organizationOperatorPolicy.canList(superadmin)).toBe(true)
  })
  it('owner can list', () => {
    expect(organizationOperatorPolicy.canList(ownerA)).toBe(true)
  })
  it('operator cannot list', () => {
    expect(organizationOperatorPolicy.canList(operatorA)).toBe(false)
    expect(organizationOperatorPolicy.canList(operatorB)).toBe(false)
  })
})

describe('organizationOperatorPolicy.canRead', () => {
  it('superadmin can read any hire', () => {
    expect(organizationOperatorPolicy.canRead(superadmin, approvedInOrgA)).toBe(true)
    expect(organizationOperatorPolicy.canRead(superadmin, approvedInOrgB)).toBe(true)
  })
  it('owner can read own-org hire', () => {
    expect(organizationOperatorPolicy.canRead(ownerA, approvedInOrgA)).toBe(true)
  })
  it('owner cannot read foreign-org hire', () => {
    expect(organizationOperatorPolicy.canRead(ownerA, approvedInOrgB)).toBe(false)
    expect(organizationOperatorPolicy.canRead(ownerB, approvedInOrgA)).toBe(false)
  })
  it('operator cannot read via admin surface', () => {
    expect(organizationOperatorPolicy.canRead(operatorA, approvedInOrgA)).toBe(false)
    expect(organizationOperatorPolicy.canRead(operatorB, approvedInOrgB)).toBe(false)
  })
})

describe('organizationOperatorPolicy.canCreate', () => {
  it('only owner can create (hire)', () => {
    expect(organizationOperatorPolicy.canCreate(ownerA)).toBe(true)
    expect(organizationOperatorPolicy.canCreate(ownerB)).toBe(true)
  })
  it('superadmin cannot create hire (no own org)', () => {
    expect(organizationOperatorPolicy.canCreate(superadmin)).toBe(false)
  })
  it('operator cannot create hire', () => {
    expect(organizationOperatorPolicy.canCreate(operatorA)).toBe(false)
  })
})

describe('organizationOperatorPolicy.canUpdate (approval-gate: rejected → false)', () => {
  it('superadmin can update approved hire anywhere', () => {
    expect(organizationOperatorPolicy.canUpdate(superadmin, approvedInOrgA)).toBe(true)
    expect(organizationOperatorPolicy.canUpdate(superadmin, approvedInOrgB)).toBe(true)
  })
  it('superadmin can update pending hire (service блокирует через 409, policy — нет)', () => {
    expect(organizationOperatorPolicy.canUpdate(superadmin, pendingInOrgA)).toBe(true)
  })
  it('owner can update own-org approved hire', () => {
    expect(organizationOperatorPolicy.canUpdate(ownerA, approvedInOrgA)).toBe(true)
  })
  it('owner cannot update foreign-org hire', () => {
    expect(organizationOperatorPolicy.canUpdate(ownerA, approvedInOrgB)).toBe(false)
    expect(organizationOperatorPolicy.canUpdate(ownerB, approvedInOrgA)).toBe(false)
  })
  it('rejected hire is read-only (§4.2b) — никто не может update, даже superadmin', () => {
    expect(organizationOperatorPolicy.canUpdate(superadmin, rejectedInOrgA)).toBe(false)
    expect(organizationOperatorPolicy.canUpdate(ownerA, rejectedInOrgA)).toBe(false)
  })
  it('operator cannot update (admin surface)', () => {
    expect(organizationOperatorPolicy.canUpdate(operatorA, approvedInOrgA)).toBe(false)
  })
})

describe('organizationOperatorPolicy.canChangeStatus (approval-gate: approved only)', () => {
  it('pending hire — гейт закрыт для всех ролей (§4.2b)', () => {
    expect(organizationOperatorPolicy.canChangeStatus(superadmin, pendingInOrgA)).toBe(false)
    expect(organizationOperatorPolicy.canChangeStatus(ownerA, pendingInOrgA)).toBe(false)
  })
  it('rejected hire — гейт закрыт для всех ролей', () => {
    expect(organizationOperatorPolicy.canChangeStatus(superadmin, rejectedInOrgA)).toBe(false)
    expect(organizationOperatorPolicy.canChangeStatus(ownerA, rejectedInOrgA)).toBe(false)
  })
  it('approved hire — superadmin anywhere', () => {
    expect(organizationOperatorPolicy.canChangeStatus(superadmin, approvedInOrgA)).toBe(true)
    expect(organizationOperatorPolicy.canChangeStatus(superadmin, approvedInOrgB)).toBe(true)
  })
  it('approved hire — owner только own-org', () => {
    expect(organizationOperatorPolicy.canChangeStatus(ownerA, approvedInOrgA)).toBe(true)
    expect(organizationOperatorPolicy.canChangeStatus(ownerA, approvedInOrgB)).toBe(false)
  })
  it('operator cannot change status', () => {
    expect(organizationOperatorPolicy.canChangeStatus(operatorA, approvedInOrgA)).toBe(false)
  })
})

describe('organizationOperatorPolicy.canDelete (разрешён во всех approval-state)', () => {
  it('superadmin can delete anywhere', () => {
    expect(organizationOperatorPolicy.canDelete(superadmin, approvedInOrgA)).toBe(true)
    expect(organizationOperatorPolicy.canDelete(superadmin, approvedInOrgB)).toBe(true)
  })
  it('owner own-org only', () => {
    expect(organizationOperatorPolicy.canDelete(ownerA, approvedInOrgA)).toBe(true)
    expect(organizationOperatorPolicy.canDelete(ownerA, approvedInOrgB)).toBe(false)
  })
  it('owner может удалить собственный rejected hire (cleanup-путь)', () => {
    expect(organizationOperatorPolicy.canDelete(ownerA, rejectedInOrgA)).toBe(true)
  })
  it('operator cannot delete', () => {
    expect(organizationOperatorPolicy.canDelete(operatorA, approvedInOrgA)).toBe(false)
  })
})

describe('organizationOperatorPolicy.canApprove / canReject (holding-approval invariant)', () => {
  it('only superadmin can approve', () => {
    expect(organizationOperatorPolicy.canApprove(superadmin)).toBe(true)
    expect(organizationOperatorPolicy.canApprove(ownerA)).toBe(false)
    expect(organizationOperatorPolicy.canApprove(ownerB)).toBe(false)
    expect(organizationOperatorPolicy.canApprove(operatorA)).toBe(false)
  })
  it('only superadmin can reject', () => {
    expect(organizationOperatorPolicy.canReject(superadmin)).toBe(true)
    expect(organizationOperatorPolicy.canReject(ownerA)).toBe(false)
    expect(organizationOperatorPolicy.canReject(ownerB)).toBe(false)
    expect(organizationOperatorPolicy.canReject(operatorA)).toBe(false)
  })
})

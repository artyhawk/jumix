import type { AuthContext } from '@jumix/auth'
import type { Crane } from '@jumix/db'
import { describe, expect, it } from 'vitest'
import { cranePolicy } from '../src/modules/crane/crane.policy'

/**
 * Unit-тесты чистых функций cranePolicy. БД/fastify не трогают — только
 * AuthContext + минимальный Pick<Crane>. Цель — зафиксировать матрицу прав
 * для holding-approval модели (ADR 0002):
 *
 *   - admin-scope (canList/canRead/canCreate/canUpdate/canChangeStatus/canDelete)
 *     по обычной иерархии (superadmin > owner > operator);
 *   - canApprove/canReject — строго superadmin; owner не может одобрять
 *     собственные заявки;
 *   - canUpdate false для rejected (read-only после отказа);
 *   - canChangeStatus false для pending/rejected (требует approval_status='approved');
 *   - canDelete true во всех approval-state'ах (cleanup разрешён).
 */

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
  userId: '00000000-0000-0000-0000-000000000001',
  role: 'operator',
  organizationId: orgA,
  tokenVersion: 0,
}

const approvedInOrgA: Pick<Crane, 'organizationId' | 'approvalStatus'> = {
  organizationId: orgA,
  approvalStatus: 'approved',
}
const approvedInOrgB: Pick<Crane, 'organizationId' | 'approvalStatus'> = {
  organizationId: orgB,
  approvalStatus: 'approved',
}
const pendingInOrgA: Pick<Crane, 'organizationId' | 'approvalStatus'> = {
  organizationId: orgA,
  approvalStatus: 'pending',
}
const rejectedInOrgA: Pick<Crane, 'organizationId' | 'approvalStatus'> = {
  organizationId: orgA,
  approvalStatus: 'rejected',
}

describe('cranePolicy.canList', () => {
  it('superadmin can list', () => {
    expect(cranePolicy.canList(superadmin)).toBe(true)
  })
  it('owner can list', () => {
    expect(cranePolicy.canList(ownerA)).toBe(true)
  })
  it('operator cannot list', () => {
    expect(cranePolicy.canList(operatorA)).toBe(false)
  })
})

describe('cranePolicy.canRead', () => {
  it('superadmin can read any crane', () => {
    expect(cranePolicy.canRead(superadmin, approvedInOrgA)).toBe(true)
    expect(cranePolicy.canRead(superadmin, approvedInOrgB)).toBe(true)
  })
  it('owner can read own-org crane', () => {
    expect(cranePolicy.canRead(ownerA, approvedInOrgA)).toBe(true)
  })
  it('owner cannot read foreign-org crane', () => {
    expect(cranePolicy.canRead(ownerA, approvedInOrgB)).toBe(false)
    expect(cranePolicy.canRead(ownerB, approvedInOrgA)).toBe(false)
  })
  it('operator cannot read cranes (admin path)', () => {
    expect(cranePolicy.canRead(operatorA, approvedInOrgA)).toBe(false)
  })
})

describe('cranePolicy.canCreate', () => {
  it('only owner can create (creates pending per ADR 0002)', () => {
    expect(cranePolicy.canCreate(ownerA)).toBe(true)
    expect(cranePolicy.canCreate(superadmin)).toBe(false)
    expect(cranePolicy.canCreate(operatorA)).toBe(false)
  })
})

describe('cranePolicy.canUpdate (approval-aware)', () => {
  it('superadmin can update approved crane', () => {
    expect(cranePolicy.canUpdate(superadmin, approvedInOrgA)).toBe(true)
    expect(cranePolicy.canUpdate(superadmin, approvedInOrgB)).toBe(true)
  })
  it('superadmin can update pending crane (pre-approve edits)', () => {
    expect(cranePolicy.canUpdate(superadmin, pendingInOrgA)).toBe(true)
  })
  it('owner can update own-org approved crane', () => {
    expect(cranePolicy.canUpdate(ownerA, approvedInOrgA)).toBe(true)
  })
  it('owner can update own-org pending crane (fix before approval)', () => {
    expect(cranePolicy.canUpdate(ownerA, pendingInOrgA)).toBe(true)
  })
  it('owner cannot update foreign-org crane', () => {
    expect(cranePolicy.canUpdate(ownerA, approvedInOrgB)).toBe(false)
  })
  it('rejected crane is read-only for EVERY role (incl. superadmin)', () => {
    expect(cranePolicy.canUpdate(superadmin, rejectedInOrgA)).toBe(false)
    expect(cranePolicy.canUpdate(ownerA, rejectedInOrgA)).toBe(false)
  })
  it('operator cannot update', () => {
    expect(cranePolicy.canUpdate(operatorA, approvedInOrgA)).toBe(false)
    expect(cranePolicy.canUpdate(operatorA, pendingInOrgA)).toBe(false)
  })
})

describe('cranePolicy.canChangeStatus (approval-gated)', () => {
  it('superadmin can change status of approved crane', () => {
    expect(cranePolicy.canChangeStatus(superadmin, approvedInOrgA)).toBe(true)
  })
  it('owner can change status of own-org approved crane', () => {
    expect(cranePolicy.canChangeStatus(ownerA, approvedInOrgA)).toBe(true)
  })
  it('owner cannot change status of own-org PENDING crane (awaits holding approve)', () => {
    expect(cranePolicy.canChangeStatus(ownerA, pendingInOrgA)).toBe(false)
  })
  it('superadmin cannot change status of PENDING crane either (must approve first)', () => {
    expect(cranePolicy.canChangeStatus(superadmin, pendingInOrgA)).toBe(false)
  })
  it('rejected crane: status is frozen for all roles', () => {
    expect(cranePolicy.canChangeStatus(superadmin, rejectedInOrgA)).toBe(false)
    expect(cranePolicy.canChangeStatus(ownerA, rejectedInOrgA)).toBe(false)
  })
  it('owner cannot change status of foreign-org approved crane', () => {
    expect(cranePolicy.canChangeStatus(ownerA, approvedInOrgB)).toBe(false)
  })
  it('operator cannot change status', () => {
    expect(cranePolicy.canChangeStatus(operatorA, approvedInOrgA)).toBe(false)
  })
})

describe('cranePolicy.canDelete (approval-agnostic cleanup)', () => {
  it('superadmin can delete any crane', () => {
    expect(cranePolicy.canDelete(superadmin, approvedInOrgA)).toBe(true)
    expect(cranePolicy.canDelete(superadmin, approvedInOrgB)).toBe(true)
  })
  it('owner can delete own-org crane (approved/pending/rejected all OK)', () => {
    expect(cranePolicy.canDelete(ownerA, approvedInOrgA)).toBe(true)
    expect(cranePolicy.canDelete(ownerA, pendingInOrgA)).toBe(true)
    expect(cranePolicy.canDelete(ownerA, rejectedInOrgA)).toBe(true)
  })
  it('owner cannot delete foreign-org crane', () => {
    expect(cranePolicy.canDelete(ownerA, approvedInOrgB)).toBe(false)
  })
  it('operator cannot delete', () => {
    expect(cranePolicy.canDelete(operatorA, approvedInOrgA)).toBe(false)
  })
})

describe('cranePolicy.canApprove', () => {
  it('only superadmin can approve (holding-approval invariant)', () => {
    expect(cranePolicy.canApprove(superadmin)).toBe(true)
    expect(cranePolicy.canApprove(ownerA)).toBe(false)
    expect(cranePolicy.canApprove(operatorA)).toBe(false)
  })
})

describe('cranePolicy.canReject', () => {
  it('only superadmin can reject', () => {
    expect(cranePolicy.canReject(superadmin)).toBe(true)
    expect(cranePolicy.canReject(ownerA)).toBe(false)
    expect(cranePolicy.canReject(operatorA)).toBe(false)
  })
})

import type { AuthContext } from '@jumix/auth'
import type { CraneProfile } from '@jumix/db'
import { describe, expect, it } from 'vitest'
import { craneProfilePolicy } from '../src/modules/crane-profile/crane-profile.policy'

/**
 * Unit-тесты чистых функций craneProfilePolicy. БД/fastify не трогают, только
 * AuthContext + минимальный Pick<CraneProfile>. Цель — зафиксировать матрицу
 * прав для platform-identity сущности из ADR 0003:
 *   - admin-pipeline (list/read/update/delete/approve/reject) — superadmin;
 *   - self-scope (canReadSelf/canUpdateSelf) — operator с userId match,
 *     БЕЗ гейта по approval_status / hire-статусу (идентичность ортогональна).
 */

const userA = '00000000-0000-0000-0000-000000000001'
const userB = '00000000-0000-0000-0000-000000000002'
const orgA = '00000000-0000-0000-0000-00000000aaaa'

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
const operatorA: AuthContext = {
  userId: userA,
  role: 'operator',
  tokenVersion: 0,
}

const profileA: Pick<CraneProfile, 'userId' | 'approvalStatus'> = {
  userId: userA,
  approvalStatus: 'approved',
}
const profileAPending: Pick<CraneProfile, 'userId' | 'approvalStatus'> = {
  userId: userA,
  approvalStatus: 'pending',
}
const profileARejected: Pick<CraneProfile, 'userId' | 'approvalStatus'> = {
  userId: userA,
  approvalStatus: 'rejected',
}

describe('craneProfilePolicy.canList', () => {
  it('superadmin can list', () => {
    expect(craneProfilePolicy.canList(superadmin)).toBe(true)
  })
  it('owner cannot list (platform-level surface)', () => {
    expect(craneProfilePolicy.canList(ownerA)).toBe(false)
  })
  it('operator cannot list', () => {
    expect(craneProfilePolicy.canList(operatorA)).toBe(false)
  })
})

describe('craneProfilePolicy.canRead', () => {
  it('superadmin can read any profile', () => {
    expect(craneProfilePolicy.canRead(superadmin, profileA)).toBe(true)
  })
  it('operator can read own profile (userId match)', () => {
    expect(craneProfilePolicy.canRead(operatorA, { userId: userA })).toBe(true)
  })
  it('operator cannot read another profile', () => {
    expect(craneProfilePolicy.canRead(operatorA, { userId: userB })).toBe(false)
  })
  it('owner cannot read platform-level profile', () => {
    expect(craneProfilePolicy.canRead(ownerA, profileA)).toBe(false)
  })
})

describe('craneProfilePolicy.canUpdate (admin)', () => {
  it('superadmin can update approved profile', () => {
    expect(craneProfilePolicy.canUpdate(superadmin, profileA)).toBe(true)
  })
  it('superadmin can update pending profile', () => {
    expect(craneProfilePolicy.canUpdate(superadmin, profileAPending)).toBe(true)
  })
  it('superadmin CANNOT update rejected (read-only after reject, §4.2b)', () => {
    expect(craneProfilePolicy.canUpdate(superadmin, profileARejected)).toBe(false)
  })
  it('owner cannot update', () => {
    expect(craneProfilePolicy.canUpdate(ownerA, profileA)).toBe(false)
  })
  it('operator cannot update (admin path)', () => {
    expect(craneProfilePolicy.canUpdate(operatorA, profileA)).toBe(false)
  })
})

describe('craneProfilePolicy.canDelete', () => {
  it('superadmin can delete', () => {
    expect(craneProfilePolicy.canDelete(superadmin)).toBe(true)
  })
  it('owner cannot delete', () => {
    expect(craneProfilePolicy.canDelete(ownerA)).toBe(false)
  })
  it('operator cannot delete', () => {
    expect(craneProfilePolicy.canDelete(operatorA)).toBe(false)
  })
})

describe('craneProfilePolicy.canApprove / canReject (holding-approval)', () => {
  it('superadmin can approve', () => {
    expect(craneProfilePolicy.canApprove(superadmin)).toBe(true)
  })
  it('owner cannot approve (external actor invariant)', () => {
    expect(craneProfilePolicy.canApprove(ownerA)).toBe(false)
  })
  it('operator cannot self-approve', () => {
    expect(craneProfilePolicy.canApprove(operatorA)).toBe(false)
  })
  it('superadmin can reject', () => {
    expect(craneProfilePolicy.canReject(superadmin)).toBe(true)
  })
  it('owner cannot reject', () => {
    expect(craneProfilePolicy.canReject(ownerA)).toBe(false)
  })
  it('operator cannot reject', () => {
    expect(craneProfilePolicy.canReject(operatorA)).toBe(false)
  })
})

describe('craneProfilePolicy.canReadSelf', () => {
  it('operator with userId match can read — approved', () => {
    expect(craneProfilePolicy.canReadSelf(operatorA, { userId: userA })).toBe(true)
  })
  it('operator with userId match can read — pending (видит свой черновик)', () => {
    expect(craneProfilePolicy.canReadSelf(operatorA, { userId: userA })).toBe(true)
  })
  it('operator with userId match can read — rejected (PDL РК + reason)', () => {
    expect(craneProfilePolicy.canReadSelf(operatorA, { userId: userA })).toBe(true)
  })
  it('operator with different userId cannot read self', () => {
    expect(craneProfilePolicy.canReadSelf(operatorA, { userId: userB })).toBe(false)
  })
  it('owner cannot use canReadSelf', () => {
    expect(craneProfilePolicy.canReadSelf(ownerA, { userId: userA })).toBe(false)
  })
  it('superadmin cannot use canReadSelf (админ-путь — canRead)', () => {
    expect(craneProfilePolicy.canReadSelf(superadmin, { userId: userA })).toBe(false)
  })
})

describe('craneProfilePolicy.canUpdateSelf', () => {
  it('operator with userId match can update (identity ортогональна approval)', () => {
    expect(craneProfilePolicy.canUpdateSelf(operatorA, { userId: userA })).toBe(true)
  })
  it('operator с другим userId НЕ может self-update', () => {
    expect(craneProfilePolicy.canUpdateSelf(operatorA, { userId: userB })).toBe(false)
  })
  it('owner cannot use canUpdateSelf', () => {
    expect(craneProfilePolicy.canUpdateSelf(ownerA, { userId: userA })).toBe(false)
  })
  it('superadmin cannot use canUpdateSelf', () => {
    expect(craneProfilePolicy.canUpdateSelf(superadmin, { userId: userA })).toBe(false)
  })
})

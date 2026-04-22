import type { AuthContext } from '@jumix/auth'
import type { Operator } from '@jumix/db'

/**
 * Чистые функции политики для operators-модуля (admin-only surface в B2d-2a).
 *
 * Self-service предикаты (canReadSelf/canUpdateSelf) переехали в
 * crane-profile-модуль (ADR 0003). Operator в этом модуле — hydrated
 * organization_operator + crane_profile shape; единственные потребители —
 * owner/superadmin admin-endpoints.
 *
 * Иерархия (CLAUDE.md §4.1):
 *   superadmin — read/list/update/status/delete любого оператора;
 *                create запрещён (operator живёт внутри org).
 *   owner      — всё со своими operators своей организации.
 *   operator   — admin endpoints запрещены (403 list/create, 404 read).
 */
export const operatorPolicy = {
  canList: (ctx: AuthContext): boolean => ctx.role !== 'operator',

  canRead: (ctx: AuthContext, op: Pick<Operator, 'organizationId' | 'userId'>): boolean => {
    if (ctx.role === 'superadmin') return true
    if (ctx.role === 'owner') return ctx.organizationId === op.organizationId
    if (ctx.role === 'operator') return ctx.userId === op.userId
    return false
  },

  canCreate: (ctx: AuthContext): boolean => ctx.role === 'owner',

  canUpdate: (ctx: AuthContext, op: Pick<Operator, 'organizationId'>): boolean => {
    if (ctx.role === 'superadmin') return true
    if (ctx.role === 'owner') return ctx.organizationId === op.organizationId
    return false
  },

  canChangeStatus: (ctx: AuthContext, op: Pick<Operator, 'organizationId'>): boolean => {
    if (ctx.role === 'superadmin') return true
    if (ctx.role === 'owner') return ctx.organizationId === op.organizationId
    return false
  },

  canDelete: (ctx: AuthContext, op: Pick<Operator, 'organizationId'>): boolean => {
    if (ctx.role === 'superadmin') return true
    if (ctx.role === 'owner') return ctx.organizationId === op.organizationId
    return false
  },
}

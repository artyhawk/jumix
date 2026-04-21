import type { AuthContext } from '@jumix/auth'
import type { Crane } from '@jumix/db'

/**
 * Чистые функции политики для cranes-модуля. БД не трогают — только ctx + target.
 *
 * Иерархия (CLAUDE.md §4.1):
 *   superadmin — read/update/status/delete любого крана; create запрещён
 *                (кран привязан к org; у superadmin org нет, создавать
 *                «в никуда» нельзя — паттерн как у sites).
 *   owner      — всё со своими кранами своей организации.
 *   operator   — ничего через этот модуль (403 list/create, 404 read).
 *                Crane-инфо оператор получит через /shifts (будущий модуль).
 */
export const cranePolicy = {
  canList: (ctx: AuthContext): boolean => ctx.role !== 'operator',

  canRead: (ctx: AuthContext, crane: Pick<Crane, 'organizationId'>): boolean => {
    if (ctx.role === 'superadmin') return true
    if (ctx.role === 'owner') return ctx.organizationId === crane.organizationId
    return false
  },

  canCreate: (ctx: AuthContext): boolean => ctx.role === 'owner',

  canUpdate: (ctx: AuthContext, crane: Pick<Crane, 'organizationId'>): boolean => {
    if (ctx.role === 'superadmin') return true
    if (ctx.role === 'owner') return ctx.organizationId === crane.organizationId
    return false
  },

  canChangeStatus: (ctx: AuthContext, crane: Pick<Crane, 'organizationId'>): boolean => {
    if (ctx.role === 'superadmin') return true
    if (ctx.role === 'owner') return ctx.organizationId === crane.organizationId
    return false
  },

  canDelete: (ctx: AuthContext, crane: Pick<Crane, 'organizationId'>): boolean => {
    if (ctx.role === 'superadmin') return true
    if (ctx.role === 'owner') return ctx.organizationId === crane.organizationId
    return false
  },
}

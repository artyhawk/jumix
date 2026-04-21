import type { AuthContext } from '@jumix/auth'
import type { Site } from '@jumix/db'

/**
 * Чистые функции политики для sites-модуля. БД не трогают — вход только
 * ctx + target. Тестируются юнит-тестами + покрываются integration-тестами
 * через endpoint'ы (см. site.test.ts RBAC матрица).
 *
 * Иерархия (CLAUDE.md §4.1):
 *   superadmin — чтение/правка/смена статуса любого site, НО create недоступен
 *                (он не привязан к org, создать site «в никуда» нельзя)
 *   owner      — всё с своими site'ами своей организации
 *   operator   — ничего через этот модуль (403 list, 404 id). Оператор увидит
 *                site своей смены через будущий /shifts-endpoint.
 */
export const sitePolicy = {
  canList: (ctx: AuthContext): boolean => ctx.role !== 'operator',

  canRead: (ctx: AuthContext, site: Pick<Site, 'organizationId'>): boolean => {
    if (ctx.role === 'superadmin') return true
    if (ctx.role === 'owner') return ctx.organizationId === site.organizationId
    return false
  },

  canCreate: (ctx: AuthContext): boolean => ctx.role === 'owner',

  canUpdate: (ctx: AuthContext, site: Pick<Site, 'organizationId'>): boolean => {
    if (ctx.role === 'superadmin') return true
    if (ctx.role === 'owner') return ctx.organizationId === site.organizationId
    return false
  },

  canChangeStatus: (ctx: AuthContext, site: Pick<Site, 'organizationId'>): boolean => {
    if (ctx.role === 'superadmin') return true
    if (ctx.role === 'owner') return ctx.organizationId === site.organizationId
    return false
  },
}

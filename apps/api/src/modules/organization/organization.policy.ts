import type { AuthContext } from '@jumix/auth'
import type { Organization } from '@jumix/db'
import { UPDATE_ORGANIZATION_FIELDS, type UpdateOrganizationField } from './organization.schemas'

/**
 * Чистые функции политики. Ни к БД, ни к запросам не обращаются — вызываются
 * из handlers/services и тестируются юнит-тестами.
 *
 * Иерархия (CLAUDE.md §4.1):
 *   superadmin — всё, КРОМЕ финансов конкретных организаций (не наш модуль)
 *   owner — чтение/правка contacts своей организации
 *   operator — организация не видна вовсе (404)
 */

const ALL_FIELDS: ReadonlySet<UpdateOrganizationField> = new Set(UPDATE_ORGANIZATION_FIELDS)
const OWNER_ALLOWED_FIELDS: ReadonlySet<UpdateOrganizationField> = new Set([
  'contactName',
  'contactPhone',
  'contactEmail',
])

/**
 * Результат canUpdate — дескриптор, а не boolean. Причина: нам нужно
 * в одном месте ответить И «разрешено ли вообще», И «какие поля можно».
 *
 * Handler, получив `allowed: true, allowedFields`, сверит реально
 * пришедшие поля с whitelist и вернёт 403 FIELD_NOT_ALLOWED если owner
 * попытался изменить запрещённое (name/bin) — явнее, чем тихий strip
 * через Zod.
 */
export type UpdateDecision =
  | { allowed: true; allowedFields: ReadonlySet<UpdateOrganizationField> }
  | { allowed: false }

export const organizationPolicy = {
  /** Создавать организации может только superadmin (§4.1 ТЗ). */
  canCreate: (ctx: AuthContext): boolean => ctx.role === 'superadmin',

  /** Чтение конкретной организации по id. Owner видит только свою, operator — никак. */
  canRead: (ctx: AuthContext, org: Pick<Organization, 'id'>): boolean => {
    if (ctx.role === 'superadmin') return true
    if (ctx.role === 'owner') return ctx.organizationId === org.id
    return false
  },

  /** list /organizations — только superadmin. Owner пользуется `/me`. */
  canList: (ctx: AuthContext): boolean => ctx.role === 'superadmin',

  canUpdate: (ctx: AuthContext, org: Pick<Organization, 'id'>): UpdateDecision => {
    if (ctx.role === 'superadmin') return { allowed: true, allowedFields: ALL_FIELDS }
    if (ctx.role === 'owner' && ctx.organizationId === org.id) {
      return { allowed: true, allowedFields: OWNER_ALLOWED_FIELDS }
    }
    return { allowed: false }
  },

  /** Жизненный цикл статуса меняет только superadmin. */
  canChangeStatus: (ctx: AuthContext): boolean => ctx.role === 'superadmin',
}

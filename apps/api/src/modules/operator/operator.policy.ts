import type { AuthContext } from '@jumix/auth'
import type { Operator } from '@jumix/db'

/**
 * Чистые функции политики для operators-модуля. БД не трогают — только ctx +
 * target. Первая имплементация self-scope pattern, задокументированного в
 * docs/architecture/authorization.md §4.2 Layer 2 / §4.2a.
 *
 * Иерархия (CLAUDE.md §4.1):
 *   superadmin — read/list/update/status/delete любого оператора через admin;
 *                create запрещён (operator живёт внутри org; у superadmin org нет).
 *   owner      — всё со своими operators своей организации через admin.
 *   operator   — admin endpoints запрещены (403 list/create, 404 read);
 *                self endpoints — доступ к СВОЕМУ профилю по ctx.userId.
 *
 * Self-scope convention (authorization.md §4.2a):
 *   canReadSelf  — любой status (включая blocked/terminated). Причина:
 *                  по PDL РК субъект персональных данных имеет право читать
 *                  свои данные и после увольнения; blocked должен понять
 *                  причину блокировки.
 *   canUpdateSelf — только status='active'. blocked/terminated не могут менять
 *                   свои данные (чтобы избежать заметания следов, также полная
 *                   заморозка профиля = дисциплинарная мера). Полный freeze
 *                   доступа выражается через deleted_at, НЕ через status.
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

  /**
   * Self-read: оператор читает свой профиль. НЕ фильтрует по status —
   * blocked/terminated могут читать свои данные (PDL РК + понимание причины
   * блокировки). Freeze полного доступа = deleted_at, не status.
   */
  canReadSelf: (ctx: AuthContext, op: Pick<Operator, 'userId'>): boolean => {
    return ctx.role === 'operator' && ctx.userId === op.userId
  },

  /**
   * Self-update: только для active. blocked/terminated читают, но не меняют
   * (см. module-level JSDoc). Avatar upload/confirm/delete — под тем же
   * predicate (аватар — часть профиля).
   */
  canUpdateSelf: (ctx: AuthContext, op: Pick<Operator, 'userId' | 'status'>): boolean => {
    return ctx.role === 'operator' && ctx.userId === op.userId && op.status === 'active'
  },
}

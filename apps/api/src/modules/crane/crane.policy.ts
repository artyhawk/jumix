import type { AuthContext } from '@jumix/auth'
import type { Crane } from '@jumix/db'

/**
 * Чистые функции политики для cranes-модуля. БД не трогают — только ctx + target.
 *
 * Иерархия (CLAUDE.md §4.1):
 *   superadmin — read/update/status/delete любого крана; create запрещён
 *                (кран привязан к org; у superadmin org нет, создавать
 *                «в никуда» нельзя — паттерн как у sites). Approve/reject —
 *                только superadmin (ADR 0002: holding-approval model).
 *   owner      — всё со своими кранами своей организации. НЕ может approve
 *                свои же заявки (гейт холдинга — обязательный внешний актор).
 *   operator   — ничего через этот модуль (403 list/create, 404 read).
 *                Crane-инфо оператор получит через /shifts (будущий модуль).
 *
 * Approval workflow (ADR 0002 + authorization.md §4.2b):
 *   - `approval_status` ортогонален operational `status`
 *   - canChangeStatus требует approval_status='approved' (pending/rejected → false)
 *   - canUpdate запрещён для rejected (read-only после отказа); pending/approved
 *     — по обычным scope-правилам
 *   - canDelete разрешён во ВСЕХ approval-state'ах (owner/superadmin могут
 *     подчищать свой же rejected)
 */
export const cranePolicy = {
  canList: (ctx: AuthContext): boolean => ctx.role !== 'operator',

  canRead: (ctx: AuthContext, crane: Pick<Crane, 'organizationId'>): boolean => {
    if (ctx.role === 'superadmin') return true
    if (ctx.role === 'owner') return ctx.organizationId === crane.organizationId
    return false
  },

  canCreate: (ctx: AuthContext): boolean => ctx.role === 'owner',

  /**
   * Update approved/pending crane — обычный scope-check. Rejected — read-only
   * (независимо от роли), единственный путь модификации rejected крана — delete.
   */
  canUpdate: (
    ctx: AuthContext,
    crane: Pick<Crane, 'organizationId' | 'approvalStatus'>,
  ): boolean => {
    if (crane.approvalStatus === 'rejected') return false
    if (ctx.role === 'superadmin') return true
    if (ctx.role === 'owner') return ctx.organizationId === crane.organizationId
    return false
  },

  /**
   * Смена operational status (active ⇄ maintenance → retired) имеет смысл
   * только для approved кранов. Pending/rejected → false: gate закрыт.
   */
  canChangeStatus: (
    ctx: AuthContext,
    crane: Pick<Crane, 'organizationId' | 'approvalStatus'>,
  ): boolean => {
    if (crane.approvalStatus !== 'approved') return false
    if (ctx.role === 'superadmin') return true
    if (ctx.role === 'owner') return ctx.organizationId === crane.organizationId
    return false
  },

  canDelete: (ctx: AuthContext, crane: Pick<Crane, 'organizationId'>): boolean => {
    if (ctx.role === 'superadmin') return true
    if (ctx.role === 'owner') return ctx.organizationId === crane.organizationId
    return false
  },

  /**
   * Approve/reject — строго superadmin. Owner не может одобрять собственные
   * заявки (ключевой инвариант holding-approval модели).
   */
  canApprove: (ctx: AuthContext): boolean => ctx.role === 'superadmin',
  canReject: (ctx: AuthContext): boolean => ctx.role === 'superadmin',

  /**
   * Assign approved crane к site внутри той же organization. Доступно owner'у
   * своей org; superadmin может для cleanup'а в любой org. Pending/rejected —
   * gate закрыт (operational операция требует approved).
   */
  canAssignToSite: (
    ctx: AuthContext,
    crane: Pick<Crane, 'organizationId' | 'approvalStatus'>,
  ): boolean => {
    if (crane.approvalStatus !== 'approved') return false
    if (ctx.role === 'superadmin') return true
    if (ctx.role === 'owner') return ctx.organizationId === crane.organizationId
    return false
  },

  /**
   * Resubmit rejected crane → pending. Доступно owner'у своей org; superadmin
   * может для cleanup'а. Approved/pending — без смысла (gate закрыт).
   */
  canResubmit: (
    ctx: AuthContext,
    crane: Pick<Crane, 'organizationId' | 'approvalStatus'>,
  ): boolean => {
    if (crane.approvalStatus !== 'rejected') return false
    if (ctx.role === 'superadmin') return true
    if (ctx.role === 'owner') return ctx.organizationId === crane.organizationId
    return false
  },
}

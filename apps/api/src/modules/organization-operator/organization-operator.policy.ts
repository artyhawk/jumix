import type { AuthContext } from '@jumix/auth'
import type { OrganizationOperator } from '@jumix/db'

/**
 * Чистые функции политики для organization-operators-модуля (ADR 0003 —
 * hire pipeline 2, authorization.md §4.2b). БД не трогают: только ctx + target.
 *
 * organization_operator — per-org найм crane_profile'а (M:N membership).
 * Identity (ФИО/ИИН/avatar) живёт на crane_profile; здесь — исключительно
 * hire-level факты: hired_at / terminated_at / operational status / availability
 * / approval_status (холдинг-гейт pipeline 2).
 *
 * Иерархия (CLAUDE.md §4.1):
 *   superadmin — read/list/update/status/delete любого найма; approve/reject
 *                pipeline 2. Create запрещён — найм создаёт owner своей org.
 *   owner      — всё со своими наймами своей организации; НЕ одобряет свои же
 *                заявки (holding-approval invariant — внешний актор обязателен).
 *   operator   — admin endpoints запрещены (403 list/create, 404 read).
 *                Собственные найма operator видит через
 *                /crane-profiles/me/memberships.
 *
 * Approval workflow (§4.2b + ADR 0003 pipeline 2):
 *   - `approval_status` ортогонален operational `status`.
 *   - canUpdate rejected hire → false (read-only после отказа; cleanup = delete).
 *   - canChangeStatus требует approval_status='approved'; pending/rejected → false.
 *   - canApprove/canReject — строго superadmin.
 *   - canDelete разрешён во всех approval-state'ах (owner может подчищать
 *     собственный rejected hire).
 */
export const organizationOperatorPolicy = {
  canList: (ctx: AuthContext): boolean => ctx.role !== 'operator',

  canRead: (ctx: AuthContext, op: Pick<OrganizationOperator, 'organizationId'>): boolean => {
    if (ctx.role === 'superadmin') return true
    if (ctx.role === 'owner') return ctx.organizationId === op.organizationId
    return false
  },

  canCreate: (ctx: AuthContext): boolean => ctx.role === 'owner',

  /**
   * Update hire-level полей (hiredAt). Rejected — read-only (§4.2b),
   * единственный путь модификации — delete.
   */
  canUpdate: (
    ctx: AuthContext,
    op: Pick<OrganizationOperator, 'organizationId' | 'approvalStatus'>,
  ): boolean => {
    if (op.approvalStatus === 'rejected') return false
    if (ctx.role === 'superadmin') return true
    if (ctx.role === 'owner') return ctx.organizationId === op.organizationId
    return false
  },

  /**
   * Operational status (active / blocked / terminated) имеет смысл только
   * для approved hire. Pending/rejected → false: гейт закрыт.
   */
  canChangeStatus: (
    ctx: AuthContext,
    op: Pick<OrganizationOperator, 'organizationId' | 'approvalStatus'>,
  ): boolean => {
    if (op.approvalStatus !== 'approved') return false
    if (ctx.role === 'superadmin') return true
    if (ctx.role === 'owner') return ctx.organizationId === op.organizationId
    return false
  },

  canDelete: (ctx: AuthContext, op: Pick<OrganizationOperator, 'organizationId'>): boolean => {
    if (ctx.role === 'superadmin') return true
    if (ctx.role === 'owner') return ctx.organizationId === op.organizationId
    return false
  },

  /**
   * Approve/reject — строго superadmin. Owner не может одобрять собственные
   * заявки (ключевой инвариант holding-approval модели — внешний актор
   * обязателен для легитимности найма в холдинге).
   */
  canApprove: (ctx: AuthContext): boolean => ctx.role === 'superadmin',
  canReject: (ctx: AuthContext): boolean => ctx.role === 'superadmin',
}

import type { AuthContext } from '@jumix/auth'
import {
  type CraneProfile,
  type DatabaseClient,
  type OrganizationOperator,
  craneProfiles,
  organizationOperators,
} from '@jumix/db'
import { and, eq, isNull, ne } from 'drizzle-orm'
import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'
import { AppError } from '../lib/errors'

/**
 * organization-context — резолвер `X-Organization-Id` header'а для operator'а
 * (ADR 0003 + authorization.md §4.2c).
 *
 * Operator JWT не несёт `organizationId` (M:N identity). Per-org операции
 * (смены, баланс, condition of hire) гейтят orgId явным header'ом. Этот
 * plugin:
 *   1) проверяет, что заголовок есть и это UUID;
 *   2) находит активный найм (`organization_operators` с
 *      `approval_status='approved' AND status <> 'terminated' AND deleted_at IS NULL`)
 *      для `(craneProfile где userId=ctx.userId)` в указанной org;
 *   3) прикрепляет `request.organizationContext = { organizationOperator, craneProfile }`
 *      к запросу для использования в handlers/services.
 *
 * Поведение:
 *   - `app.requireOrganizationContext` — preHandler. Если header отсутствует
 *     или пуст → 400 `ORGANIZATION_HEADER_REQUIRED`. Если header невалидный
 *     UUID → 400 `ORGANIZATION_HEADER_INVALID`. Если найм не найден или
 *     неактивен → 403 `ORGANIZATION_MEMBERSHIP_NOT_FOUND` (умышленно не 404:
 *     orgId приходит от клиента, его существование — публично).
 *
 * Роли:
 *   - operator (ADR 0003): header ОБЯЗАТЕЛЕН. Сценарий использования —
 *     `/shifts`, `/me/memberships/:id/*` и т.п.
 *   - owner / superadmin: header игнорируется. Их tenant scope уже зашит
 *     в JWT (organizationId claim у owner, null у superadmin) — per-request
 *     override мог бы создать путаницу, поэтому заголовок просто не читается,
 *     а сам preHandler кидает 403 `ORGANIZATION_CONTEXT_OPERATOR_ONLY` если
 *     его повесить на не-operator endpoint по ошибке.
 *
 * Plugin зависит от `authenticate`: request.ctx должен быть готов.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const HEADER_NAME = 'x-organization-id'

export type OrganizationContext = {
  organizationOperator: OrganizationOperator
  craneProfile: CraneProfile
}

function badRequest(code: string, message: string): AppError {
  return new AppError({ statusCode: 400, code, message })
}

function forbidden(code: string, message: string): AppError {
  return new AppError({ statusCode: 403, code, message })
}

function extractHeader(request: FastifyRequest): string | null {
  const raw = request.headers[HEADER_NAME]
  if (typeof raw !== 'string') return null
  const trimmed = raw.trim()
  if (trimmed.length === 0) return null
  return trimmed
}

async function resolve(
  db: DatabaseClient,
  ctx: AuthContext,
  organizationId: string,
): Promise<OrganizationContext | null> {
  if (ctx.role !== 'operator') return null

  const rows = await db.db
    .select({ oo: organizationOperators, cp: craneProfiles })
    .from(organizationOperators)
    .innerJoin(craneProfiles, eq(organizationOperators.craneProfileId, craneProfiles.id))
    .where(
      and(
        eq(craneProfiles.userId, ctx.userId),
        eq(organizationOperators.organizationId, organizationId),
        eq(organizationOperators.approvalStatus, 'approved'),
        ne(organizationOperators.status, 'terminated'),
        isNull(organizationOperators.deletedAt),
        isNull(craneProfiles.deletedAt),
      ),
    )
    .limit(1)

  const row = rows[0]
  if (!row) return null
  return { organizationOperator: row.oo as OrganizationOperator, craneProfile: row.cp }
}

export async function requireOrganizationContext(
  request: FastifyRequest,
  _reply: FastifyReply,
): Promise<void> {
  const ctx = request.ctx
  if (ctx.role !== 'operator') {
    throw forbidden(
      'ORGANIZATION_CONTEXT_OPERATOR_ONLY',
      'X-Organization-Id is only used by operator role',
    )
  }

  const raw = extractHeader(request)
  if (!raw) {
    throw badRequest(
      'ORGANIZATION_HEADER_REQUIRED',
      'X-Organization-Id header is required for this endpoint',
    )
  }
  if (!UUID_RE.test(raw)) {
    throw badRequest('ORGANIZATION_HEADER_INVALID', 'X-Organization-Id must be a UUID')
  }

  const resolved = await resolve(request.server.db, ctx, raw)
  if (!resolved) {
    throw forbidden(
      'ORGANIZATION_MEMBERSHIP_NOT_FOUND',
      'No active approved membership in this organization',
    )
  }

  request.organizationContext = resolved
}

const organizationContextPlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.decorate('requireOrganizationContext', requireOrganizationContext)
}

export default fp(organizationContextPlugin, {
  name: 'organization-context',
  dependencies: ['authenticate'],
})

declare module 'fastify' {
  interface FastifyInstance {
    requireOrganizationContext: (request: FastifyRequest, reply: FastifyReply) => Promise<void>
  }
  interface FastifyRequest {
    organizationContext?: OrganizationContext
  }
}

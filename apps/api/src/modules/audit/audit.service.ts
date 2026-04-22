import type { AuthContext } from '@jumix/auth'
import { type DatabaseClient, auditLog, organizations, users } from '@jumix/db'
import { desc, eq } from 'drizzle-orm'
import { AppError } from '../../lib/errors'
import { auditPolicy } from './audit.policy'

/**
 * Enriched audit event — actor joined from users, organization joined from
 * organizations. Metadata preserved as-is (клиент интерпретирует per action).
 */
export type RecentAuditEvent = {
  id: string
  actor: {
    userId: string | null
    name: string | null
    role: string | null
  }
  action: string
  target: {
    type: string | null
    id: string | null
  }
  organizationId: string | null
  organizationName: string | null
  metadata: Record<string, unknown>
  ipAddress: string | null
  createdAt: string
}

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 100

function forbidden(code: string, message: string): AppError {
  return new AppError({ statusCode: 403, code, message })
}

function badRequest(code: string, message: string): AppError {
  return new AppError({ statusCode: 400, code, message })
}

export class AuditService {
  constructor(private readonly database: DatabaseClient) {}

  async getRecent(ctx: AuthContext, limit = DEFAULT_LIMIT): Promise<RecentAuditEvent[]> {
    if (!auditPolicy.canViewRecent(ctx)) {
      throw forbidden('FORBIDDEN', 'Only superadmin can view audit log')
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
      throw badRequest('LIMIT_OUT_OF_RANGE', `limit must be between 1 and ${MAX_LIMIT}`)
    }

    const db = this.database.db

    const rows = await db
      .select({
        id: auditLog.id,
        actorUserId: auditLog.actorUserId,
        actorRole: auditLog.actorRole,
        actorName: users.name,
        action: auditLog.action,
        targetType: auditLog.targetType,
        targetId: auditLog.targetId,
        organizationId: auditLog.organizationId,
        organizationName: organizations.name,
        metadata: auditLog.metadata,
        ipAddress: auditLog.ipAddress,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .leftJoin(users, eq(auditLog.actorUserId, users.id))
      .leftJoin(organizations, eq(auditLog.organizationId, organizations.id))
      .orderBy(desc(auditLog.createdAt))
      .limit(limit)

    return rows.map((r) => ({
      id: r.id,
      actor: {
        userId: r.actorUserId,
        name: r.actorName,
        role: r.actorRole,
      },
      action: r.action,
      target: {
        type: r.targetType,
        id: r.targetId,
      },
      organizationId: r.organizationId,
      organizationName: r.organizationName,
      metadata: (r.metadata as Record<string, unknown>) ?? {},
      ipAddress: r.ipAddress,
      createdAt: r.createdAt.toISOString(),
    }))
  }
}

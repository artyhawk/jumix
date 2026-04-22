import type { AuthContext } from '@jumix/auth'
import {
  type DatabaseClient,
  craneProfiles,
  cranes,
  organizationOperators,
  organizations,
} from '@jumix/db'
import { and, count, eq, gte, isNull, ne } from 'drizzle-orm'
import { AppError } from '../../lib/errors'
import { dashboardPolicy } from './dashboard.policy'

/**
 * Stats response. Shape зафиксирован контрактом с web-клиентом (B3-UI-2) —
 * менять = обновлять DTO-тип на фронте.
 *
 * pending.*    — глобальные очереди на approval (все три типа суперадмина)
 * active.*     — «живые» счётчики (approved + не-retired/terminated, без soft-delete)
 * thisWeek.*   — новые регистрации за последние 7 дней (для рост-метрики)
 */
export type DashboardStats = {
  pending: {
    craneProfiles: number
    organizationOperators: number
    cranes: number
  }
  active: {
    organizations: number
    craneProfiles: number
    cranes: number
    memberships: number
  }
  thisWeek: {
    newRegistrations: number
  }
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

function forbidden(code: string, message: string): AppError {
  return new AppError({ statusCode: 403, code, message })
}

export class DashboardService {
  constructor(private readonly database: DatabaseClient) {}

  async getStats(ctx: AuthContext): Promise<DashboardStats> {
    if (!dashboardPolicy.canViewStats(ctx)) {
      throw forbidden('FORBIDDEN', 'Only superadmin can view dashboard stats')
    }

    const db = this.database.db
    const weekAgo = new Date(Date.now() - SEVEN_DAYS_MS)

    const [
      craneProfilesPending,
      hiresPending,
      cranesPending,
      organizationsActive,
      craneProfilesActive,
      cranesActive,
      membershipsActive,
      newRegistrationsThisWeek,
    ] = await Promise.all([
      db
        .select({ value: count() })
        .from(craneProfiles)
        .where(and(eq(craneProfiles.approvalStatus, 'pending'), isNull(craneProfiles.deletedAt))),
      db
        .select({ value: count() })
        .from(organizationOperators)
        .where(
          and(
            eq(organizationOperators.approvalStatus, 'pending'),
            isNull(organizationOperators.deletedAt),
          ),
        ),
      db
        .select({ value: count() })
        .from(cranes)
        .where(and(eq(cranes.approvalStatus, 'pending'), isNull(cranes.deletedAt))),
      db.select({ value: count() }).from(organizations).where(eq(organizations.status, 'active')),
      db
        .select({ value: count() })
        .from(craneProfiles)
        .where(and(eq(craneProfiles.approvalStatus, 'approved'), isNull(craneProfiles.deletedAt))),
      db
        .select({ value: count() })
        .from(cranes)
        .where(
          and(
            eq(cranes.approvalStatus, 'approved'),
            ne(cranes.status, 'retired'),
            isNull(cranes.deletedAt),
          ),
        ),
      db
        .select({ value: count() })
        .from(organizationOperators)
        .where(
          and(
            eq(organizationOperators.approvalStatus, 'approved'),
            eq(organizationOperators.status, 'active'),
            isNull(organizationOperators.deletedAt),
          ),
        ),
      db
        .select({ value: count() })
        .from(craneProfiles)
        .where(and(gte(craneProfiles.createdAt, weekAgo), isNull(craneProfiles.deletedAt))),
    ])

    return {
      pending: {
        craneProfiles: firstCount(craneProfilesPending),
        organizationOperators: firstCount(hiresPending),
        cranes: firstCount(cranesPending),
      },
      active: {
        organizations: firstCount(organizationsActive),
        craneProfiles: firstCount(craneProfilesActive),
        cranes: firstCount(cranesActive),
        memberships: firstCount(membershipsActive),
      },
      thisWeek: {
        newRegistrations: firstCount(newRegistrationsThisWeek),
      },
    }
  }
}

/**
 * drizzle count() возвращает число через postgres-js, но иногда string для
 * больших значений. Нормализуем на boundary.
 */
function firstCount(rows: Array<{ value: number | string }>): number {
  const raw = rows[0]?.value ?? 0
  return typeof raw === 'string' ? Number.parseInt(raw, 10) : raw
}

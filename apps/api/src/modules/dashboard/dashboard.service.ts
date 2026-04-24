import type { AuthContext } from '@jumix/auth'
import {
  type DatabaseClient,
  craneProfiles,
  cranes,
  organizationOperators,
  organizations,
  shifts,
  sites,
} from '@jumix/db'
import { and, count, countDistinct, eq, gte, inArray, isNull, ne } from 'drizzle-orm'
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

/**
 * Owner-scoped stats: счётчики только для собственной организации. Отдельный
 * shape от platform-wide DashboardStats — discriminated по endpoint, не по
 * полю в response. Web типизирует напрямую (отдельный hook
 * useOwnerDashboardStats).
 *
 *   active.sites          — сайты status='active' (без archived/completed/soft-deleted)
 *   active.cranes         — **operating cranes (M4, ADR 0006)** — distinct crane_id
 *                           из shifts со status IN ('active', 'paused') в этой org.
 *                           Label на web «Кранов в работе» совпадает с новой
 *                           семантикой. Fleet size (approved+active) теперь
 *                           access'ится через /my-cranes list, отдельный
 *                           dashboard-card под него не нужен.
 *   active.memberships    — approved + active hires (нанятые крановщики)
 *   pending.cranes        — pending заявки на собственные cranes (для footer-action)
 *   pending.hires         — pending заявки на найм
 */
export type OwnerDashboardStats = {
  active: {
    sites: number
    cranes: number
    memberships: number
  }
  pending: {
    cranes: number
    hires: number
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

  /**
   * Owner-scoped стат для собственной организации. Endpoint /dashboard/owner-stats.
   * Owner без active organization (теоретически невозможно, но invariant'но
   * защищаем) — 403; superadmin → 403 (он использует /stats); operator → 403.
   */
  async getOwnerStats(ctx: AuthContext): Promise<OwnerDashboardStats> {
    if (!dashboardPolicy.canViewOwnerStats(ctx) || ctx.role !== 'owner') {
      throw forbidden('FORBIDDEN', 'Only owner can view owner dashboard stats')
    }

    const orgId = ctx.organizationId
    const db = this.database.db

    const [activeSites, operatingCranes, activeMemberships, pendingCranes, pendingHires] =
      await Promise.all([
        db
          .select({ value: count() })
          .from(sites)
          .where(and(eq(sites.organizationId, orgId), eq(sites.status, 'active'))),
        // M4 semantic: «кранов в работе» — distinct crane_id с active|paused
        // shift. Было: approved+active fleet size.
        db
          .select({ value: countDistinct(shifts.craneId) })
          .from(shifts)
          .where(
            and(eq(shifts.organizationId, orgId), inArray(shifts.status, ['active', 'paused'])),
          ),
        db
          .select({ value: count() })
          .from(organizationOperators)
          .where(
            and(
              eq(organizationOperators.organizationId, orgId),
              eq(organizationOperators.approvalStatus, 'approved'),
              eq(organizationOperators.status, 'active'),
              isNull(organizationOperators.deletedAt),
            ),
          ),
        db
          .select({ value: count() })
          .from(cranes)
          .where(
            and(
              eq(cranes.organizationId, orgId),
              eq(cranes.approvalStatus, 'pending'),
              isNull(cranes.deletedAt),
            ),
          ),
        db
          .select({ value: count() })
          .from(organizationOperators)
          .where(
            and(
              eq(organizationOperators.organizationId, orgId),
              eq(organizationOperators.approvalStatus, 'pending'),
              isNull(organizationOperators.deletedAt),
            ),
          ),
      ])

    return {
      active: {
        sites: firstCount(activeSites),
        cranes: firstCount(operatingCranes),
        memberships: firstCount(activeMemberships),
      },
      pending: {
        cranes: firstCount(pendingCranes),
        hires: firstCount(pendingHires),
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

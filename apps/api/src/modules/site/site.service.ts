import type { AuthContext } from '@jumix/auth'
import type { DatabaseClient, Site, SiteStatus } from '@jumix/db'
import type { FastifyBaseLogger } from 'fastify'
import { AppError } from '../../lib/errors'
import { sitePolicy } from './site.policy'
import { SiteRepository } from './site.repository'
import type { CreateSiteInput, ListSitesQuery, UpdateSiteInput } from './site.schemas'

/**
 * SiteService — orchestration для sites-модуля.
 *
 * Обязанности:
 *   - policy checks (sitePolicy) до любого I/O;
 *   - scope lookup через findInScope → null → 404 (§4.3);
 *   - status transitions (valid table ниже) с явным 409 для запрещённых;
 *   - идемпотентность: smart-noop когда status уже target (как у organizations).
 *
 * Singleton, per-call repository с ctx.
 */

type RequestMeta = {
  ipAddress: string | null
}

function forbidden(code: string, message: string): AppError {
  return new AppError({ statusCode: 403, code, message })
}
function notFound(): AppError {
  return new AppError({ statusCode: 404, code: 'SITE_NOT_FOUND', message: 'Site not found' })
}
function conflict(code: string, message: string): AppError {
  return new AppError({ statusCode: 409, code, message })
}

/**
 * Разрешённые переходы статусов. Таблица читаемее чем if/else.
 *   active    ⇄ completed (сдана / обратно)
 *   active    → archived  (скрыть)
 *   completed → archived
 *   archived  → active    (восстановить)
 * Запрещённые: например, archived → completed (вычеркнутый объект нельзя
 * внезапно «сдать»; сначала верни в active, потом complete).
 */
const STATUS_TRANSITIONS: Record<SiteStatus, ReadonlySet<SiteStatus>> = {
  active: new Set<SiteStatus>(['completed', 'archived']),
  completed: new Set<SiteStatus>(['active', 'archived']),
  archived: new Set<SiteStatus>(['active']),
}

export class SiteService {
  constructor(
    private readonly database: DatabaseClient,
    private readonly logger: FastifyBaseLogger,
  ) {}

  private repoFor(ctx: AuthContext): SiteRepository {
    return new SiteRepository(this.database, ctx)
  }

  async list(
    ctx: AuthContext,
    params: ListSitesQuery,
  ): Promise<{ rows: Site[]; nextCursor: string | null }> {
    if (!sitePolicy.canList(ctx)) {
      throw forbidden('FORBIDDEN', 'Operators cannot list sites')
    }
    return this.repoFor(ctx).list(params)
  }

  async getById(ctx: AuthContext, id: string): Promise<Site> {
    const site = await this.repoFor(ctx).findInScope(id)
    if (!site) throw notFound() // скрывает существование
    return site
  }

  async create(ctx: AuthContext, input: CreateSiteInput, meta: RequestMeta): Promise<Site> {
    if (!sitePolicy.canCreate(ctx)) {
      // Superadmin сюда не попадёт: у него нет организации, куда писать site.
      // Operator тем более.
      throw forbidden('FORBIDDEN', 'Only owner can create sites')
    }
    // canCreate уже гарантировал owner (AuthContext.organizationId: string).
    if (ctx.role !== 'owner') {
      throw forbidden('FORBIDDEN', 'Only owner can create sites')
    }

    const created = await this.repoFor(ctx).create(
      {
        organizationId: ctx.organizationId,
        name: input.name,
        address: input.address ?? null,
        latitude: input.latitude,
        longitude: input.longitude,
        radiusM: input.radiusM,
        notes: input.notes ?? null,
      },
      {
        actorUserId: ctx.userId,
        actorRole: ctx.role,
        ipAddress: meta.ipAddress,
        metadata: {
          name: input.name,
          // Полные координаты в audit — чтобы при typo в долготе («site в
          // Атлантике») можно было восстановить что ввёл owner.
          latitude: input.latitude,
          longitude: input.longitude,
          radiusM: input.radiusM,
        },
      },
    )
    return created
  }

  async update(
    ctx: AuthContext,
    id: string,
    patch: UpdateSiteInput,
    meta: RequestMeta,
  ): Promise<Site> {
    const repo = this.repoFor(ctx)
    const existing = await repo.findInScope(id)
    if (!existing) throw notFound()

    if (!sitePolicy.canUpdate(ctx, existing)) {
      throw forbidden('FORBIDDEN', 'Not allowed to update this site')
    }

    const metadata: Record<string, unknown> = {
      fields: Object.keys(patch),
      before: pickChangedFields(existing, patch),
    }

    const updated = await repo.updateFields(id, existing.organizationId, patch, {
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      ipAddress: meta.ipAddress,
      metadata,
    })
    if (!updated) throw notFound()
    return updated
  }

  async changeStatus(
    ctx: AuthContext,
    id: string,
    next: SiteStatus,
    meta: RequestMeta,
  ): Promise<Site> {
    const repo = this.repoFor(ctx)
    const existing = await repo.findInScope(id)
    if (!existing) throw notFound()

    if (!sitePolicy.canChangeStatus(ctx, existing)) {
      throw forbidden('FORBIDDEN', 'Not allowed to change status of this site')
    }

    if (existing.status === next) {
      // Идемпотентность: не пишем дубль в audit — консистентно с organizations
      return existing
    }

    const allowed = STATUS_TRANSITIONS[existing.status]
    if (!allowed || !allowed.has(next)) {
      throw conflict(
        'INVALID_STATUS_TRANSITION',
        `Cannot transition site from ${existing.status} to ${next}`,
      )
    }

    const updated = await repo.setStatus(id, existing.organizationId, next, {
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      ipAddress: meta.ipAddress,
      metadata: { from: existing.status, to: next },
    })
    if (!updated) {
      this.logger.error({ id }, 'site setStatus returned null after successful findInScope')
      throw notFound()
    }
    return updated
  }
}

/**
 * Собирает «before»-снимок для audit. Для координат сохраняем обе
 * (оба поля обязательно приходят парой) чтобы реверт был возможен по журналу.
 */
function pickChangedFields(site: Site, patch: UpdateSiteInput): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (patch.name !== undefined) out.name = site.name
  if (patch.address !== undefined) out.address = site.address
  if (patch.radiusM !== undefined) out.radiusM = site.geofenceRadiusM
  if (patch.notes !== undefined) out.notes = site.notes
  if (patch.latitude !== undefined) {
    out.latitude = site.latitude
    out.longitude = site.longitude
  }
  return out
}

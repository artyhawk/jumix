import type { AuthContext } from '@jumix/auth'
import type { Crane, CraneStatus, DatabaseClient } from '@jumix/db'
import type { FastifyBaseLogger } from 'fastify'
import { AppError } from '../../lib/errors'
import { SiteRepository } from '../site/site.repository'
import { cranePolicy } from './crane.policy'
import {
  type CraneListApprovalFilter,
  CraneRepository,
  type CraneUpdateFields,
} from './crane.repository'
import type { CreateCraneInput, ListCranesQuery, UpdateCraneInput } from './crane.schemas'

/**
 * CraneService — orchestration для cranes-модуля.
 *
 * Ответственность:
 *   - policy checks (cranePolicy) до I/O;
 *   - cross-table tenant check: при siteId — `SiteRepository(ctx).findInScope` +
 *     проверка `site.organizationId === crane.organizationId` (страховка
 *     против superadmin'а, выбирающего site из чужой org);
 *   - status transitions (active ⇄ maintenance, *→retired; retired — терминал)
 *     с 409 на запрещённые переходы;
 *   - идемпотентность status/delete: повтор target-состояния → 200/без audit.
 *   - conflict-detection для `inventory_number` (409 INVENTORY_NUMBER_ALREADY_EXISTS),
 *     pre-check + fallback на pg unique_violation от race.
 *   - approval workflow (ADR 0002): create → pending; approve/reject — только
 *     superadmin; rejected crane — read-only (update/setStatus → 409); approve
 *     не-pending → 409 CRANE_NOT_PENDING (не меняем approved/rejected).
 *
 * Singleton, per-call репозитории создаются с ctx из request.
 */

type RequestMeta = {
  ipAddress: string | null
}

const PG_UNIQUE_VIOLATION = '23505'

function isPgUniqueViolation(err: unknown): err is { code: string; constraint_name?: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === PG_UNIQUE_VIOLATION
  )
}

function forbidden(code: string, message: string): AppError {
  return new AppError({ statusCode: 403, code, message })
}
function craneNotFound(): AppError {
  return new AppError({ statusCode: 404, code: 'CRANE_NOT_FOUND', message: 'Crane not found' })
}
function siteNotFound(): AppError {
  // Используется для foreign/out-of-scope site при create/update. 404
  // скрывает существование site'а вне scope (§4.3).
  return new AppError({ statusCode: 404, code: 'SITE_NOT_FOUND', message: 'Site not found' })
}
function conflict(code: string, message: string): AppError {
  return new AppError({ statusCode: 409, code, message })
}

/**
 * Разрешённые переходы статусов крана.
 *   active      ⇄ maintenance  (работает / на ТО)
 *   active      → retired      (списан)
 *   maintenance → retired
 *   retired     → *            запрещён (терминал)
 */
const STATUS_TRANSITIONS: Record<CraneStatus, ReadonlySet<CraneStatus>> = {
  active: new Set<CraneStatus>(['maintenance', 'retired']),
  maintenance: new Set<CraneStatus>(['active', 'retired']),
  retired: new Set<CraneStatus>(),
}

export class CraneService {
  constructor(
    private readonly database: DatabaseClient,
    private readonly logger: FastifyBaseLogger,
  ) {}

  private repoFor(ctx: AuthContext): CraneRepository {
    return new CraneRepository(this.database, ctx)
  }

  private siteRepoFor(ctx: AuthContext): SiteRepository {
    return new SiteRepository(this.database, ctx)
  }

  /**
   * Проверяет, что siteId виден текущему ctx И принадлежит ожидаемой
   * организации (owner + существующий site — одно и то же by findInScope,
   * но для superadmin'а нужен explicit cross-org check).
   *
   * null → вызывающий кидает 404 SITE_NOT_FOUND.
   */
  private async resolveSiteForOrg(
    ctx: AuthContext,
    siteId: string,
    targetOrgId: string,
  ): Promise<true | null> {
    const site = await this.siteRepoFor(ctx).findInScope(siteId)
    if (!site) return null
    if (site.organizationId !== targetOrgId) return null
    return true
  }

  /**
   * Default для approvalStatus query-фильтра: если не задан, owner/superadmin
   * видят approved — основной operational список. Свои pending/rejected можно
   * запросить явно через ?approvalStatus=pending|rejected|all.
   */
  private resolveApprovalFilter(query: ListCranesQuery): CraneListApprovalFilter {
    return query.approvalStatus ?? 'approved'
  }

  async list(
    ctx: AuthContext,
    params: ListCranesQuery,
  ): Promise<{ rows: Crane[]; nextCursor: string | null }> {
    if (!cranePolicy.canList(ctx)) {
      throw forbidden('FORBIDDEN', 'Operators cannot list cranes')
    }
    return this.repoFor(ctx).list({
      cursor: params.cursor,
      limit: params.limit,
      search: params.search,
      status: params.status,
      type: params.type,
      siteId: params.siteId,
      approvalStatus: this.resolveApprovalFilter(params),
    })
  }

  async getById(ctx: AuthContext, id: string): Promise<Crane> {
    const crane = await this.repoFor(ctx).findInScope(id)
    if (!crane) throw craneNotFound()
    return crane
  }

  async create(ctx: AuthContext, input: CreateCraneInput, meta: RequestMeta): Promise<Crane> {
    if (!cranePolicy.canCreate(ctx) || ctx.role !== 'owner') {
      throw forbidden('FORBIDDEN', 'Only owner can create cranes')
    }

    const organizationId = ctx.organizationId

    // Cross-table tenant: site должен быть в той же org и видим ctx'у.
    if (input.siteId) {
      const ok = await this.resolveSiteForOrg(ctx, input.siteId, organizationId)
      if (!ok) throw siteNotFound()
    }

    const repo = this.repoFor(ctx)

    // Pre-check inventory_number. Дублирование constraint'а — но даёт
    // дружелюбную 409 до попытки insert'а. Race с concurrent insert'ом
    // ловится fallback'ом в catch.
    if (input.inventoryNumber) {
      const existing = await repo.findActiveByInventory(organizationId, input.inventoryNumber)
      if (existing) {
        throw conflict(
          'INVENTORY_NUMBER_ALREADY_EXISTS',
          'Crane with this inventory number already exists in this organization',
        )
      }
    }

    try {
      return await repo.create(
        {
          organizationId,
          siteId: input.siteId ?? null,
          type: input.type,
          model: input.model,
          inventoryNumber: input.inventoryNumber ?? null,
          capacityTon: input.capacityTon,
          boomLengthM: input.boomLengthM ?? null,
          yearManufactured: input.yearManufactured ?? null,
          tariffsJson: input.tariffsJson,
          notes: input.notes ?? null,
        },
        {
          actorUserId: ctx.userId,
          actorRole: ctx.role,
          ipAddress: meta.ipAddress,
          metadata: {
            type: input.type,
            model: input.model,
            inventoryNumber: input.inventoryNumber ?? null,
            siteId: input.siteId ?? null,
            capacityTon: input.capacityTon,
          },
        },
      )
    } catch (err) {
      if (
        isPgUniqueViolation(err) &&
        err.constraint_name === 'cranes_inventory_unique_active_idx'
      ) {
        throw conflict(
          'INVENTORY_NUMBER_ALREADY_EXISTS',
          'Crane with this inventory number already exists in this organization',
        )
      }
      this.logger.error({ err }, 'createCrane unexpected error')
      throw err
    }
  }

  async update(
    ctx: AuthContext,
    id: string,
    patch: UpdateCraneInput,
    meta: RequestMeta,
  ): Promise<Crane> {
    const repo = this.repoFor(ctx)
    const existing = await repo.findInScope(id)
    if (!existing) throw craneNotFound()

    // policy.canUpdate уже отсекает rejected cranes (read-only после отказа)
    // — даём явный 409 с объясняющим кодом, чтобы owner видел, почему
    // его кран больше не редактируется.
    if (existing.approvalStatus === 'rejected') {
      throw conflict('CRANE_REJECTED_READONLY', 'Rejected crane is read-only (delete is allowed)')
    }

    if (!cranePolicy.canUpdate(ctx, existing)) {
      throw forbidden('FORBIDDEN', 'Not allowed to update this crane')
    }

    // Site reassignment: siteId в patch может быть строкой (перевод) или null (снять).
    if (patch.siteId !== undefined && patch.siteId !== null) {
      const ok = await this.resolveSiteForOrg(ctx, patch.siteId, existing.organizationId)
      if (!ok) throw siteNotFound()
    }

    // Inventory_number reassignment: pre-check коллизии в той же org.
    if (
      patch.inventoryNumber !== undefined &&
      patch.inventoryNumber !== null &&
      patch.inventoryNumber !== existing.inventoryNumber
    ) {
      const conflictRow = await repo.findActiveByInventory(
        existing.organizationId,
        patch.inventoryNumber,
      )
      if (conflictRow && conflictRow.id !== id) {
        throw conflict(
          'INVENTORY_NUMBER_ALREADY_EXISTS',
          'Crane with this inventory number already exists in this organization',
        )
      }
    }

    const updateFields: CraneUpdateFields = {}
    if (patch.type !== undefined) updateFields.type = patch.type
    if (patch.model !== undefined) updateFields.model = patch.model
    if (patch.inventoryNumber !== undefined) updateFields.inventoryNumber = patch.inventoryNumber
    if (patch.capacityTon !== undefined) updateFields.capacityTon = patch.capacityTon
    if (patch.boomLengthM !== undefined) updateFields.boomLengthM = patch.boomLengthM
    if (patch.yearManufactured !== undefined) updateFields.yearManufactured = patch.yearManufactured
    if (patch.siteId !== undefined) updateFields.siteId = patch.siteId
    if (patch.tariffsJson !== undefined) updateFields.tariffsJson = patch.tariffsJson
    if (patch.notes !== undefined) updateFields.notes = patch.notes

    const metadata: Record<string, unknown> = {
      fields: Object.keys(patch),
      before: pickChangedFields(existing, patch),
    }

    try {
      const updated = await repo.updateFields(id, existing.organizationId, updateFields, {
        actorUserId: ctx.userId,
        actorRole: ctx.role,
        ipAddress: meta.ipAddress,
        metadata,
      })
      if (!updated) throw craneNotFound()
      return updated
    } catch (err) {
      if (
        isPgUniqueViolation(err) &&
        err.constraint_name === 'cranes_inventory_unique_active_idx'
      ) {
        throw conflict(
          'INVENTORY_NUMBER_ALREADY_EXISTS',
          'Crane with this inventory number already exists in this organization',
        )
      }
      throw err
    }
  }

  async changeStatus(
    ctx: AuthContext,
    id: string,
    next: CraneStatus,
    meta: RequestMeta,
  ): Promise<Crane> {
    const repo = this.repoFor(ctx)
    const existing = await repo.findInScope(id)
    if (!existing) throw craneNotFound()

    if (existing.approvalStatus === 'pending') {
      throw conflict(
        'CRANE_NOT_APPROVED',
        'Crane must be approved by holding before operational status changes',
      )
    }
    if (existing.approvalStatus === 'rejected') {
      throw conflict('CRANE_REJECTED_READONLY', 'Rejected crane is read-only (delete is allowed)')
    }

    if (!cranePolicy.canChangeStatus(ctx, existing)) {
      throw forbidden('FORBIDDEN', 'Not allowed to change status of this crane')
    }

    if (existing.status === next) {
      // Идемпотентность: повтор — не пишем audit (консистентно с sites/organizations)
      return existing
    }

    const allowed = STATUS_TRANSITIONS[existing.status]
    if (!allowed.has(next)) {
      throw conflict(
        'INVALID_STATUS_TRANSITION',
        `Cannot transition crane from ${existing.status} to ${next}`,
      )
    }

    const updated = await repo.setStatus(id, existing.organizationId, next, {
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      ipAddress: meta.ipAddress,
      metadata: { from: existing.status, to: next },
    })
    if (!updated) {
      this.logger.error({ id }, 'crane setStatus returned null after successful findInScope')
      throw craneNotFound()
    }
    return updated
  }

  async softDelete(ctx: AuthContext, id: string, meta: RequestMeta): Promise<Crane> {
    const repo = this.repoFor(ctx)
    const existing = await repo.findInScope(id)
    if (!existing) throw craneNotFound()

    if (!cranePolicy.canDelete(ctx, existing)) {
      throw forbidden('FORBIDDEN', 'Not allowed to delete this crane')
    }

    const deleted = await repo.softDelete(id, existing.organizationId, {
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      ipAddress: meta.ipAddress,
      metadata: {
        status: existing.status,
        approvalStatus: existing.approvalStatus,
        siteId: existing.siteId,
        inventoryNumber: existing.inventoryNumber,
      },
    })
    if (!deleted) {
      this.logger.error({ id }, 'crane softDelete returned null after successful findInScope')
      throw craneNotFound()
    }
    return deleted
  }

  async approve(ctx: AuthContext, id: string, meta: RequestMeta): Promise<Crane> {
    if (!cranePolicy.canApprove(ctx)) {
      throw forbidden('FORBIDDEN', 'Only superadmin can approve cranes')
    }

    const repo = this.repoFor(ctx)
    const existing = await repo.findInScope(id)
    if (!existing) throw craneNotFound()

    if (existing.approvalStatus !== 'pending') {
      throw conflict(
        'CRANE_NOT_PENDING',
        `Crane is already ${existing.approvalStatus}; only pending cranes can be approved`,
      )
    }

    const approved = await repo.approve(id, existing.organizationId, {
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      ipAddress: meta.ipAddress,
      metadata: {
        previousApprovalStatus: 'pending',
        model: existing.model,
        inventoryNumber: existing.inventoryNumber,
      },
    })
    if (!approved) {
      // Race: кто-то поменял состояние между findInScope и approve. Перечитываем.
      const re = await repo.findAnyById(id)
      if (re && re.approvalStatus !== 'pending') {
        throw conflict(
          'CRANE_NOT_PENDING',
          `Crane is already ${re.approvalStatus}; only pending cranes can be approved`,
        )
      }
      this.logger.error({ id }, 'crane approve returned null after pending state verified')
      throw craneNotFound()
    }
    return approved
  }

  async reject(ctx: AuthContext, id: string, reason: string, meta: RequestMeta): Promise<Crane> {
    if (!cranePolicy.canReject(ctx)) {
      throw forbidden('FORBIDDEN', 'Only superadmin can reject cranes')
    }

    const repo = this.repoFor(ctx)
    const existing = await repo.findInScope(id)
    if (!existing) throw craneNotFound()

    if (existing.approvalStatus !== 'pending') {
      throw conflict(
        'CRANE_NOT_PENDING',
        `Crane is already ${existing.approvalStatus}; only pending cranes can be rejected`,
      )
    }

    const rejected = await repo.reject(id, existing.organizationId, reason, {
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      ipAddress: meta.ipAddress,
      metadata: {
        previousApprovalStatus: 'pending',
        reason,
        model: existing.model,
        inventoryNumber: existing.inventoryNumber,
      },
    })
    if (!rejected) {
      const re = await repo.findAnyById(id)
      if (re && re.approvalStatus !== 'pending') {
        throw conflict(
          'CRANE_NOT_PENDING',
          `Crane is already ${re.approvalStatus}; only pending cranes can be rejected`,
        )
      }
      this.logger.error({ id }, 'crane reject returned null after pending state verified')
      throw craneNotFound()
    }
    return rejected
  }
}

function pickChangedFields(crane: Crane, patch: UpdateCraneInput): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (patch.type !== undefined) out.type = crane.type
  if (patch.model !== undefined) out.model = crane.model
  if (patch.inventoryNumber !== undefined) out.inventoryNumber = crane.inventoryNumber
  if (patch.capacityTon !== undefined) out.capacityTon = crane.capacityTon
  if (patch.boomLengthM !== undefined) out.boomLengthM = crane.boomLengthM
  if (patch.yearManufactured !== undefined) out.yearManufactured = crane.yearManufactured
  if (patch.siteId !== undefined) out.siteId = crane.siteId
  if (patch.tariffsJson !== undefined) out.tariffsJson = crane.tariffsJson
  if (patch.notes !== undefined) out.notes = crane.notes
  return out
}

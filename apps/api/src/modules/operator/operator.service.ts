import type { AuthContext } from '@jumix/auth'
import type { DatabaseClient, Operator, OperatorStatus } from '@jumix/db'
import type { FastifyBaseLogger } from 'fastify'
import { AppError } from '../../lib/errors'
import type { UserRepository } from '../auth/repositories'
import { operatorPolicy } from './operator.policy'
import { type AuditMeta, OperatorRepository, type OperatorWithUser } from './operator.repository'
import type {
  CreateOperatorInput,
  ListOperatorsQuery,
  UpdateOperatorAdminInput,
} from './operator.schemas'

/**
 * OperatorService — admin orchestration для hydrated Operator shape (organization_operators
 * + crane_profiles JOIN). Self-service методы переехали в CraneProfileService (ADR 0003).
 *
 * Обязанности:
 *   - policy checks (operatorPolicy) до I/O;
 *   - phone conflict detection (409 PHONE_ALREADY_REGISTERED);
 *   - ИИН conflict detection (409 IIN_ALREADY_EXISTS_IN_ORG) + fallback
 *     на pg unique_violation от race. Error code сохранён для MVP API stability
 *     даже если в ADR 0003 ИИН уже глобально уникален.
 *   - 404 вместо 403 для скрытия существования (CLAUDE.md §4.3);
 *   - `terminated_at` semantics (historical record, см. JSDoc
 *     `changeStatus` + `computeTerminatedAt`).
 *
 * Singleton. Per-call OperatorRepository с ctx из request.
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
function operatorNotFound(): AppError {
  return new AppError({
    statusCode: 404,
    code: 'OPERATOR_NOT_FOUND',
    message: 'Operator not found',
  })
}
function conflict(code: string, message: string): AppError {
  return new AppError({ statusCode: 409, code, message })
}

export class OperatorService {
  constructor(
    private readonly database: DatabaseClient,
    private readonly users: UserRepository,
    private readonly logger: FastifyBaseLogger,
  ) {}

  private repoFor(ctx: AuthContext): OperatorRepository {
    return new OperatorRepository(this.database, ctx)
  }

  // ---------- queries ----------

  async list(
    ctx: AuthContext,
    params: ListOperatorsQuery,
  ): Promise<{ rows: Operator[]; nextCursor: string | null }> {
    if (!operatorPolicy.canList(ctx)) {
      throw forbidden('FORBIDDEN', 'Operators cannot list operators')
    }
    return this.repoFor(ctx).list(params)
  }

  async getById(ctx: AuthContext, id: string): Promise<OperatorWithUser> {
    const found = await this.repoFor(ctx).findInScopeWithUser(id)
    if (!found) throw operatorNotFound()
    return found
  }

  // ---------- admin mutations ----------

  async create(
    ctx: AuthContext,
    input: CreateOperatorInput,
    meta: RequestMeta,
  ): Promise<OperatorWithUser> {
    if (!operatorPolicy.canCreate(ctx) || ctx.role !== 'owner') {
      throw forbidden('FORBIDDEN', 'Only owner can create operators')
    }
    const organizationId = ctx.organizationId

    // Phone conflict: users.phone UNIQUE глобально (включая soft-deleted).
    // Консистентно с organization.create.
    const phoneConflict = await this.users.findAnyByPhone(input.phone)
    if (phoneConflict) {
      throw conflict('PHONE_ALREADY_REGISTERED', 'This phone is already registered')
    }

    // ИИН conflict глобально (ADR 0003 — iin globally unique). Error-code
    // оставлен legacy-совместимым ради MVP API stability.
    const iinConflict = await this.repoFor(ctx).findActiveByIin(organizationId, input.iin)
    if (iinConflict) {
      throw conflict(
        'IIN_ALREADY_EXISTS_IN_ORG',
        'Operator with this IIN already exists in this organization',
      )
    }

    const displayName = [input.lastName, input.firstName].filter(Boolean).join(' ').trim()

    try {
      return await this.repoFor(ctx).createUserAndOperator(
        {
          phone: input.phone,
          organizationId,
          name: displayName || input.firstName,
        },
        {
          organizationId,
          firstName: input.firstName,
          lastName: input.lastName,
          patronymic: input.patronymic ?? null,
          iin: input.iin,
          hiredAt: input.hiredAt ?? null,
          specialization: input.specialization ?? {},
        },
        {
          actorUserId: ctx.userId,
          actorRole: ctx.role,
          ipAddress: meta.ipAddress,
          metadata: {
            firstName: input.firstName,
            lastName: input.lastName,
            iin: input.iin,
            // Полный phone — только в audit; в HTTP-ответ идёт masked.
            phone: input.phone,
          },
        },
      )
    } catch (err) {
      if (isPgUniqueViolation(err)) {
        if (err.constraint_name === 'users_phone_key') {
          throw conflict('PHONE_ALREADY_REGISTERED', 'This phone is already registered')
        }
        if (err.constraint_name === 'crane_profiles_iin_unique_active_idx') {
          throw conflict(
            'IIN_ALREADY_EXISTS_IN_ORG',
            'Operator with this IIN already exists in this organization',
          )
        }
      }
      this.logger.error({ err }, 'createOperator unexpected error')
      throw err
    }
  }

  async update(
    ctx: AuthContext,
    id: string,
    patch: UpdateOperatorAdminInput,
    meta: RequestMeta,
  ): Promise<OperatorWithUser> {
    const repo = this.repoFor(ctx)
    const existingWithUser = await repo.findInScopeWithUser(id)
    if (!existingWithUser) throw operatorNotFound()
    const existing = existingWithUser.operator

    if (!operatorPolicy.canUpdate(ctx, existing)) {
      throw forbidden('FORBIDDEN', 'Not allowed to update this operator')
    }

    if (patch.iin !== undefined && patch.iin !== existing.iin) {
      const iinConflict = await repo.findActiveByIin(existing.organizationId, patch.iin)
      if (iinConflict && iinConflict.id !== id) {
        throw conflict(
          'IIN_ALREADY_EXISTS_IN_ORG',
          'Operator with this IIN already exists in this organization',
        )
      }
    }

    try {
      const updated = await repo.updateFields(
        id,
        existing.organizationId,
        {
          firstName: patch.firstName,
          lastName: patch.lastName,
          patronymic: patch.patronymic,
          iin: patch.iin,
          hiredAt: patch.hiredAt,
          terminatedAt: patch.terminatedAt,
          specialization: patch.specialization,
        },
        {
          actorUserId: ctx.userId,
          actorRole: ctx.role,
          ipAddress: meta.ipAddress,
          metadata: { fields: Object.keys(patch) },
        },
      )
      if (!updated) throw operatorNotFound()
      return { operator: updated, userPhone: existingWithUser.userPhone }
    } catch (err) {
      if (
        isPgUniqueViolation(err) &&
        err.constraint_name === 'crane_profiles_iin_unique_active_idx'
      ) {
        throw conflict(
          'IIN_ALREADY_EXISTS_IN_ORG',
          'Operator with this IIN already exists in this organization',
        )
      }
      throw err
    }
  }

  /**
   * changeStatus. Логика terminated_at:
   *   - если current.status === next (идемпотентность) — no-op, возвращаем как
   *     есть, НЕ пишем audit, НЕ трогаем terminated_at (в т.ч. не перезаписываем
   *     первую дату увольнения при повторном вызове terminate→terminate).
   *   - иначе: новое значение terminated_at решается `computeTerminatedAt`.
   *
   * computeTerminatedAt:
   *   - next='terminated' (и current не 'terminated', т.к. идемпотентность
   *     отфильтрована выше) → new Date() (первое или повторное увольнение
   *     после восстановления).
   *   - next в {'active','blocked'} → current.terminatedAt (сохранение
   *     исторической даты после восстановления; null если никогда не увольняли).
   */
  async changeStatus(
    ctx: AuthContext,
    id: string,
    next: OperatorStatus,
    reason: string | undefined,
    meta: RequestMeta,
  ): Promise<OperatorWithUser> {
    const repo = this.repoFor(ctx)
    const existingWithUser = await repo.findInScopeWithUser(id)
    if (!existingWithUser) throw operatorNotFound()
    const existing = existingWithUser.operator

    if (!operatorPolicy.canChangeStatus(ctx, existing)) {
      throw forbidden('FORBIDDEN', 'Not allowed to change status of this operator')
    }

    if (existing.status === next) {
      return existingWithUser
    }

    const terminatedAt = computeTerminatedAt(existing, next)

    const updated = await repo.setStatus(id, existing.organizationId, next, terminatedAt, {
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      ipAddress: meta.ipAddress,
      metadata: {
        from: existing.status,
        to: next,
        reason: reason ?? null,
      },
    })
    if (!updated) {
      this.logger.error({ id }, 'operator setStatus returned null after successful findInScope')
      throw operatorNotFound()
    }
    return { operator: updated, userPhone: existingWithUser.userPhone }
  }

  async softDelete(ctx: AuthContext, id: string, meta: RequestMeta): Promise<OperatorWithUser> {
    const repo = this.repoFor(ctx)
    const existingWithUser = await repo.findInScopeWithUser(id)
    if (!existingWithUser) throw operatorNotFound()
    const existing = existingWithUser.operator

    if (!operatorPolicy.canDelete(ctx, existing)) {
      throw forbidden('FORBIDDEN', 'Not allowed to delete this operator')
    }

    const deleted = await repo.softDelete(id, existing.organizationId, {
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      ipAddress: meta.ipAddress,
      metadata: {
        status: existing.status,
        iin: existing.iin,
      },
    })
    if (!deleted) {
      this.logger.error({ id }, 'operator softDelete returned null after successful findInScope')
      throw operatorNotFound()
    }
    return { operator: deleted, userPhone: existingWithUser.userPhone }
  }
}

function computeTerminatedAt(
  current: Pick<Operator, 'status' | 'terminatedAt'>,
  next: OperatorStatus,
): Date | null {
  if (next === 'terminated') {
    return new Date()
  }
  return current.terminatedAt
}

export type { AuditMeta }

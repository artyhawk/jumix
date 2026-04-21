import type { AuthContext } from '@jumix/auth'
import type { DatabaseClient, Organization, User } from '@jumix/db'
import { maskPhone } from '@jumix/shared'
import type { FastifyBaseLogger } from 'fastify'
import { AppError } from '../../lib/errors'
import type { UserRepository } from '../auth/repositories'
import { organizationPolicy } from './organization.policy'
import { OrganizationRepository } from './organization.repository'
import type {
  CreateOrganizationInput,
  UpdateOrganizationField,
  UpdateOrganizationInput,
} from './organization.schemas'

/**
 * OrganizationService — orchestration-слой для organizations-модуля.
 *
 * Обязанности:
 *   - policy checks (через organizationPolicy)
 *   - conflict detection в правильном порядке (BIN → phone; CLAUDE.md §4.3)
 *   - pg unique_violation (23505) → 409 AppError как фолбэк от race
 *   - сбор audit metadata (полный phone, без маскировки — audit internal)
 *   - маскировка phone в DTO перед отправкой клиенту (enumeration-защита)
 *
 * Singleton в app.plugin. Репозиторий создаётся per-call c ctx из request.
 */

type RequestMeta = {
  ipAddress: string | null
}

type OwnerDTO = {
  id: string
  name: string
  phone: string // masked
}

export type OrganizationWithOwnerDTO = {
  organization: Organization
  owner: OwnerDTO
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
function notFound(): AppError {
  return new AppError({
    statusCode: 404,
    code: 'ORGANIZATION_NOT_FOUND',
    message: 'Organization not found',
  })
}
function conflict(code: string, message: string): AppError {
  return new AppError({ statusCode: 409, code, message })
}

export class OrganizationService {
  constructor(
    private readonly database: DatabaseClient,
    private readonly users: UserRepository,
    private readonly logger: FastifyBaseLogger,
  ) {}

  private repoFor(ctx: AuthContext): OrganizationRepository {
    return new OrganizationRepository(this.database, ctx)
  }

  async list(
    ctx: AuthContext,
    params: { cursor?: string; limit: number; search?: string; status?: Organization['status'] },
  ): Promise<{ rows: Organization[]; nextCursor: string | null }> {
    if (!organizationPolicy.canList(ctx)) {
      throw forbidden('FORBIDDEN', 'Only superadmin can list organizations')
    }
    return this.repoFor(ctx).listForSuperadmin(params)
  }

  async getById(ctx: AuthContext, id: string): Promise<Organization> {
    const org = await this.repoFor(ctx).findInScope(id)
    if (!org) throw notFound()
    return org
  }

  /**
   * GET /organizations/me — возвращает организацию текущего owner'а.
   * Superadmin сюда не ходит (у него нет «своей» организации). Operator
   * тоже — чтобы не раскрывать бизнес-данные компании.
   */
  async getOwn(ctx: AuthContext): Promise<Organization> {
    if (ctx.role !== 'owner') {
      throw forbidden('FORBIDDEN', '/me is available to owners only')
    }
    const org = await this.repoFor(ctx).findAnyById(ctx.organizationId)
    if (!org) throw notFound()
    return org
  }

  async create(
    ctx: AuthContext,
    input: CreateOrganizationInput,
    meta: RequestMeta,
  ): Promise<OrganizationWithOwnerDTO> {
    if (!organizationPolicy.canCreate(ctx)) {
      throw forbidden('FORBIDDEN', 'Only superadmin can create organizations')
    }

    const repo = this.repoFor(ctx)

    // Conflict-detection order (CLAUDE.md §4.3): BIN первый. Причина:
    // БИН — публичная информация юрлица, enumeration через 409 никому
    // не мешает. Phone — PII, его утечка через 409 — проблема.
    const binConflict = await repo.findByBin(input.bin)
    if (binConflict) {
      throw conflict('BIN_ALREADY_EXISTS', 'Organization with this BIN already exists')
    }

    const phoneConflict = await this.users.findAnyByPhone(input.ownerPhone)
    if (phoneConflict) {
      throw conflict('PHONE_ALREADY_REGISTERED', 'This phone is already registered')
    }

    try {
      const created = await repo.createOrganizationWithOwner(
        {
          organization: {
            name: input.name,
            bin: input.bin,
            contactName: input.contactName ?? null,
            contactPhone: input.contactPhone ?? null,
            contactEmail: input.contactEmail ?? null,
          },
          owner: { phone: input.ownerPhone, name: input.ownerName },
        },
        {
          actorUserId: ctx.userId,
          actorRole: ctx.role,
          ipAddress: meta.ipAddress,
          metadata: {
            organizationName: input.name,
            bin: input.bin,
            // Полный phone — в audit можно. В HTTP-ответ идёт masked.
            ownerPhone: input.ownerPhone,
            ownerName: input.ownerName,
          },
        },
      )
      return { organization: created.organization, owner: toOwnerDTO(created.owner) }
    } catch (err) {
      if (isPgUniqueViolation(err)) {
        // Race: между pre-check и insert кто-то успел вставить. Мапим на
        // тот же 409 код по constraint'у.
        const constraint = err.constraint_name
        if (constraint === 'organizations_bin_key') {
          throw conflict('BIN_ALREADY_EXISTS', 'Organization with this BIN already exists')
        }
        if (constraint === 'users_phone_key') {
          throw conflict('PHONE_ALREADY_REGISTERED', 'This phone is already registered')
        }
      }
      this.logger.error({ err }, 'createOrganization unexpected error')
      throw err
    }
  }

  async update(
    ctx: AuthContext,
    id: string,
    patch: UpdateOrganizationInput,
    meta: RequestMeta,
  ): Promise<Organization> {
    const repo = this.repoFor(ctx)

    const existing = await repo.findInScope(id)
    if (!existing) throw notFound() // 404 скрывает существование (§4.3)

    const decision = organizationPolicy.canUpdate(ctx, existing)
    if (!decision.allowed) throw forbidden('FORBIDDEN', 'Not allowed to update this organization')

    const requested = Object.keys(patch) as UpdateOrganizationField[]
    const disallowed = requested.filter((f) => !decision.allowedFields.has(f))
    if (disallowed.length > 0) {
      throw new AppError({
        statusCode: 403,
        code: 'FIELD_NOT_ALLOWED',
        message: `Fields not allowed for your role: ${disallowed.join(', ')}`,
        details: { fields: disallowed },
      })
    }

    // BIN может меняться — если да, защищаемся от коллизии
    if (patch.bin && patch.bin !== existing.bin) {
      const binConflict = await repo.findByBin(patch.bin)
      if (binConflict) {
        throw conflict('BIN_ALREADY_EXISTS', 'Organization with this BIN already exists')
      }
    }

    try {
      const updated = await repo.updateFields(id, patch, {
        actorUserId: ctx.userId,
        actorRole: ctx.role,
        ipAddress: meta.ipAddress,
        metadata: { fields: requested, before: pickChanged(existing, patch) },
      })
      if (!updated) throw notFound()
      return updated
    } catch (err) {
      if (isPgUniqueViolation(err) && 'constraint_name' in err) {
        if (err.constraint_name === 'organizations_bin_key') {
          throw conflict('BIN_ALREADY_EXISTS', 'Organization with this BIN already exists')
        }
      }
      throw err
    }
  }

  async suspend(ctx: AuthContext, id: string, meta: RequestMeta): Promise<Organization> {
    return this.changeStatus(ctx, id, 'suspended', meta)
  }

  async activate(ctx: AuthContext, id: string, meta: RequestMeta): Promise<Organization> {
    return this.changeStatus(ctx, id, 'active', meta)
  }

  private async changeStatus(
    ctx: AuthContext,
    id: string,
    next: Organization['status'],
    meta: RequestMeta,
  ): Promise<Organization> {
    if (!organizationPolicy.canChangeStatus(ctx)) {
      throw forbidden('FORBIDDEN', 'Only superadmin can change organization status')
    }
    const repo = this.repoFor(ctx)
    const existing = await repo.findAnyById(id)
    if (!existing) throw notFound()
    if (existing.status === next) {
      // идемпотентность: тот же статус — возвращаем как есть без audit-шума
      return existing
    }
    const updated = await repo.setStatus(id, next, {
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      ipAddress: meta.ipAddress,
      metadata: { from: existing.status, to: next },
    })
    if (!updated) throw notFound()
    return updated
  }
}

function toOwnerDTO(owner: User): OwnerDTO {
  return {
    id: owner.id,
    name: owner.name,
    phone: maskPhone(owner.phone),
  }
}

function pickChanged(
  org: Organization,
  patch: UpdateOrganizationInput,
): Partial<Record<UpdateOrganizationField, unknown>> {
  const out: Partial<Record<UpdateOrganizationField, unknown>> = {}
  for (const key of Object.keys(patch) as UpdateOrganizationField[]) {
    if (key === 'contactPhone') {
      // В audit-metadata сохраняем только last 4 для PII-минимизации —
      // полный номер если был раньше уже есть в логе audit_log.create события.
      const before = org.contactPhone
      out[key] = before ? maskPhone(before) : null
    } else {
      out[key] = (org as Record<string, unknown>)[key] ?? null
    }
  }
  return out
}

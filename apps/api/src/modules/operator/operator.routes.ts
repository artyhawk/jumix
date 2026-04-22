import type { Operator } from '@jumix/db'
import { maskPhone } from '@jumix/shared'
import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import {
  avatarUploadUrlRequestSchema,
  changeOperatorStatusSchema,
  confirmAvatarSchema,
  createOperatorSchema,
  listOperatorsQuerySchema,
  operatorIdParamsSchema,
  updateOperatorAdminSchema,
  updateOperatorSelfSchema,
} from './operator.schemas'

/**
 * Operators REST endpoints.
 *
 * Admin (owner своей org / superadmin любой):
 *   POST   /api/v1/operators                  create (owner only — у superadmin нет org)
 *   GET    /api/v1/operators                  cursor-list, strict query schema
 *   GET    /api/v1/operators/:id              read in scope
 *   PATCH  /api/v1/operators/:id              update (не status, не avatar, не phone)
 *   PATCH  /api/v1/operators/:id/status       change status (+ terminated_at semantics)
 *   DELETE /api/v1/operators/:id              soft-delete
 *
 * Self (только role=operator, субъект — ЭКСКЛЮЗИВНО `ctx.userId`, см. CLAUDE.md §6 rule #10):
 *   GET    /api/v1/operators/me               read own profile (любой status)
 *   PATCH  /api/v1/operators/me               update whitelist ФИО (status='active' required)
 *   POST   /api/v1/operators/me/avatar/upload-url  presigned PUT (active only)
 *   POST   /api/v1/operators/me/avatar/confirm     подтверждение upload'а (active only)
 *   DELETE /api/v1/operators/me/avatar             удалить свой аватар (active only)
 *
 * Все под app.authenticate. Policy/scope/tenant — в service, handler'ы только
 * парсят, мапят в DTO. `phone` из users маскируется на boundary через
 * `maskPhone` (полный номер — только в audit metadata).
 */
export const registerOperatorRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.register(
    async (scoped) => {
      scoped.addHook('preHandler', app.authenticate)

      // -------- self endpoints: регистрируются ДО :id чтобы не коллидировать --------

      scoped.get('/me', async (request) => {
        const { operator, userPhone } = await app.operatorService.getOwn(request.ctx)
        return toPublicDTO(app, operator, userPhone)
      })

      scoped.patch('/me', async (request) => {
        const patch = updateOperatorSelfSchema.parse(request.body)
        const { operator, userPhone } = await app.operatorService.updateSelf(request.ctx, patch, {
          ipAddress: request.ip,
        })
        return toPublicDTO(app, operator, userPhone)
      })

      scoped.post('/me/avatar/upload-url', async (request) => {
        const body = avatarUploadUrlRequestSchema.parse(request.body)
        return app.operatorService.requestAvatarUpload(request.ctx, body.contentType)
      })

      scoped.post('/me/avatar/confirm', async (request) => {
        const body = confirmAvatarSchema.parse(request.body)
        const { operator, userPhone } = await app.operatorService.confirmAvatar(
          request.ctx,
          body.key,
          { ipAddress: request.ip },
        )
        return toPublicDTO(app, operator, userPhone)
      })

      scoped.delete('/me/avatar', async (request) => {
        const { operator, userPhone } = await app.operatorService.deleteAvatar(request.ctx, {
          ipAddress: request.ip,
        })
        return toPublicDTO(app, operator, userPhone)
      })

      // -------- admin endpoints --------

      scoped.get('/', async (request) => {
        const query = listOperatorsQuerySchema.parse(request.query)
        const { rows, nextCursor } = await app.operatorService.list(request.ctx, query)
        // Список-вариант: phone из users НЕ джоиним (N+1 / ненужный объём).
        // В списке phone не нужен; detail-view через GET /:id отдаёт masked phone.
        const items = await Promise.all(rows.map((op) => toPublicListDTO(app, op)))
        return { items, nextCursor }
      })

      scoped.post('/', async (request, reply) => {
        const body = createOperatorSchema.parse(request.body)
        const { operator, userPhone } = await app.operatorService.create(request.ctx, body, {
          ipAddress: request.ip,
        })
        reply.code(201)
        return toPublicDTO(app, operator, userPhone)
      })

      scoped.get('/:id', async (request) => {
        const { id } = operatorIdParamsSchema.parse(request.params)
        const { operator, userPhone } = await app.operatorService.getById(request.ctx, id)
        return toPublicDTO(app, operator, userPhone)
      })

      scoped.patch('/:id', async (request) => {
        const { id } = operatorIdParamsSchema.parse(request.params)
        const patch = updateOperatorAdminSchema.parse(request.body)
        const { operator, userPhone } = await app.operatorService.update(request.ctx, id, patch, {
          ipAddress: request.ip,
        })
        return toPublicDTO(app, operator, userPhone)
      })

      scoped.patch('/:id/status', async (request) => {
        const { id } = operatorIdParamsSchema.parse(request.params)
        const body = changeOperatorStatusSchema.parse(request.body)
        const { operator, userPhone } = await app.operatorService.changeStatus(
          request.ctx,
          id,
          body.status,
          body.reason,
          { ipAddress: request.ip },
        )
        return toPublicDTO(app, operator, userPhone)
      })

      scoped.delete('/:id', async (request) => {
        const { id } = operatorIdParamsSchema.parse(request.params)
        const { operator, userPhone } = await app.operatorService.softDelete(request.ctx, id, {
          ipAddress: request.ip,
        })
        return toPublicDTO(app, operator, userPhone)
      })
    },
    { prefix: '/api/v1/operators' },
  )
}

type PublicOperatorDTO = {
  id: string
  userId: string
  organizationId: string
  firstName: string
  lastName: string
  patronymic: string | null
  iin: string
  phone: string
  avatarUrl: string | null
  hiredAt: string | null
  terminatedAt: string | null
  specialization: Record<string, unknown>
  status: 'active' | 'blocked' | 'terminated'
  availability: 'free' | 'busy' | 'on_shift' | null
  createdAt: string
  updatedAt: string
}

type PublicOperatorListItemDTO = Omit<PublicOperatorDTO, 'phone'>

/**
 * Async — avatarUrl генерируется через presigned GET (IO).
 */
async function toPublicDTO(
  app: FastifyInstance,
  op: Operator,
  userPhone: string,
): Promise<PublicOperatorDTO> {
  const avatarUrl = await resolveAvatarUrl(app, op.avatarKey)
  return {
    id: op.id,
    userId: op.userId,
    organizationId: op.organizationId,
    firstName: op.firstName,
    lastName: op.lastName,
    patronymic: op.patronymic,
    iin: op.iin,
    phone: maskPhone(userPhone),
    avatarUrl,
    hiredAt: dateOnly(op.hiredAt),
    terminatedAt: dateOnly(op.terminatedAt),
    specialization: op.specialization,
    status: op.status,
    availability: op.availability,
    createdAt: op.createdAt.toISOString(),
    updatedAt: op.updatedAt.toISOString(),
  }
}

async function toPublicListDTO(
  app: FastifyInstance,
  op: Operator,
): Promise<PublicOperatorListItemDTO> {
  const avatarUrl = await resolveAvatarUrl(app, op.avatarKey)
  return {
    id: op.id,
    userId: op.userId,
    organizationId: op.organizationId,
    firstName: op.firstName,
    lastName: op.lastName,
    patronymic: op.patronymic,
    iin: op.iin,
    avatarUrl,
    hiredAt: dateOnly(op.hiredAt),
    terminatedAt: dateOnly(op.terminatedAt),
    specialization: op.specialization,
    status: op.status,
    availability: op.availability,
    createdAt: op.createdAt.toISOString(),
    updatedAt: op.updatedAt.toISOString(),
  }
}

async function resolveAvatarUrl(
  app: FastifyInstance,
  avatarKey: string | null,
): Promise<string | null> {
  if (!avatarKey) return null
  const { url } = await app.storage.createPresignedGetUrl(avatarKey)
  return url
}

function dateOnly(value: Date | string | null): string | null {
  if (value === null) return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  // Drizzle `date`-колонки возвращают строку 'YYYY-MM-DD' — просто пробрасываем.
  return value
}

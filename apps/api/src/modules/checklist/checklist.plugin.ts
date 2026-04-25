import { randomUUID } from 'node:crypto'
import type { FastifyInstance, FastifyPluginAsync } from 'fastify'
import fp from 'fastify-plugin'
import { z } from 'zod'
import { AppError } from '../../lib/errors'
import { buildPendingPhotoKey } from '../../lib/storage/object-key'

/**
 * Checklist module (M6, ADR 0008) — minimal: только photo upload-url
 * endpoint. Submission самой checklist'и embedded в `POST /shifts/start`
 * (атомарная транзакция с shift insert).
 *
 * `POST /api/v1/checklists/photos/upload-url` — operator only, presigned PUT
 * для optional photo equipment (например, фото damaged item чтобы owner
 * увидел контекст refusal). Reuse pending-prefix pattern (incidents).
 */

const PHOTO_MAX_BYTES = 10 * 1024 * 1024
const PHOTO_ALLOWED_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
])

const requestPhotoUploadUrlSchema = z.object({
  contentType: z.string().min(1).max(120),
  filename: z.string().trim().min(1).max(120),
})

const checklistPlugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.register(
    async (scoped) => {
      scoped.addHook('preHandler', app.authenticate)

      scoped.post('/photos/upload-url', async (request) => {
        if (request.ctx.role !== 'operator') {
          throw new AppError({
            statusCode: 403,
            code: 'FORBIDDEN',
            message: 'Only operator can upload checklist photos',
          })
        }
        const body = requestPhotoUploadUrlSchema.parse(request.body)
        if (!PHOTO_ALLOWED_CONTENT_TYPES.has(body.contentType.toLowerCase())) {
          throw new AppError({
            statusCode: 400,
            code: 'PHOTO_CONTENT_TYPE_INVALID',
            message: 'Unsupported image content type',
          })
        }
        const key = buildPendingPhotoKey({
          userId: request.ctx.userId,
          uniqueId: randomUUID(),
          filename: body.filename,
        })
        const presigned = await app.storage.createPresignedPutUrl(key, {
          contentType: body.contentType,
          maxBytes: PHOTO_MAX_BYTES,
        })
        return {
          uploadUrl: presigned.url,
          key,
          headers: presigned.headers,
          expiresAt: presigned.expiresAt.toISOString(),
        }
      })
    },
    { prefix: '/api/v1/checklists' },
  )
}

export default fp(checklistPlugin, {
  name: 'checklist',
  dependencies: ['authenticate', 'storage'],
})

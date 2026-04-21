import type { FastifyError, FastifyInstance } from 'fastify'
import { ZodError } from 'zod'
import { isAppError } from '../lib/errors'

type ErrorBody = {
  error: {
    code: string
    message: string
    details?: unknown
  }
}

/**
 * Единый error-handler. Нормализует любой throw в формат
 * { error: { code, message, details? } } с правильным статусом.
 *
 * CLAUDE.md §14.4: стандартные HTTP-статусы, детерминированный code.
 *
 * Порядок:
 *  1. AppError → код и статус из ошибки
 *  2. ZodError → 422 + issues
 *  3. Fastify validation / serialization error → 400
 *  4. fastify-sensible HttpError (reply.notFound() и т.п.) → пропускаем
 *  5. Всё остальное → 500 INTERNAL_ERROR (body не раскрывает детали в prod)
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((rawErr: unknown, request, reply) => {
    const err = rawErr as FastifyError
    request.log.error({ err }, 'request error')

    if (isAppError(err)) {
      const body: ErrorBody = {
        error: { code: err.code, message: err.message, details: err.details },
      }
      return reply.code(err.statusCode).send(body)
    }

    if (err instanceof ZodError) {
      const body: ErrorBody = {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: err.issues,
        },
      }
      return reply.code(422).send(body)
    }

    // Fastify's built-in validation error (JSON schema)
    if (err.validation) {
      const body: ErrorBody = {
        error: {
          code: 'VALIDATION_ERROR',
          message: err.message,
          details: err.validation,
        },
      }
      return reply.code(400).send(body)
    }

    // fastify-sensible / fastify-http-errors
    const statusCode = err.statusCode ?? 500
    if (statusCode >= 400 && statusCode < 500) {
      const body: ErrorBody = {
        error: {
          code: mapFastifyHttpErrorCode(statusCode, (err as { code?: string }).code),
          message: err.message,
        },
      }
      return reply.code(statusCode).send(body)
    }

    // 5xx — не раскрываем внутренности в prod
    const isProd = process.env.NODE_ENV === 'production'
    const body: ErrorBody = {
      error: {
        code: 'INTERNAL_ERROR',
        message: isProd ? 'Internal server error' : err.message,
      },
    }
    return reply.code(500).send(body)
  })
}

function mapFastifyHttpErrorCode(statusCode: number, rawCode?: string): string {
  if (rawCode && /^[A-Z_]+$/.test(rawCode)) return rawCode
  switch (statusCode) {
    case 400:
      return 'BAD_REQUEST'
    case 401:
      return 'UNAUTHORIZED'
    case 403:
      return 'FORBIDDEN'
    case 404:
      return 'NOT_FOUND'
    case 409:
      return 'CONFLICT'
    case 422:
      return 'VALIDATION_ERROR'
    case 429:
      return 'RATE_LIMITED'
    default:
      return 'CLIENT_ERROR'
  }
}

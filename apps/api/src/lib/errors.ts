/**
 * Базовый класс ошибок приложения. Формат error body — CLAUDE.md §14.4.
 *
 * { error: { code, message, details? } }
 *
 * code — SCREAMING_SNAKE_CASE (OPERATOR_NOT_FOUND, RATE_LIMITED, ...)
 * message — человекочитаемое для логов / dev UI
 * details — опционально, структурированные данные (например, zod issues)
 */
export class AppError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly details?: unknown

  constructor(params: {
    statusCode: number
    code: string
    message: string
    details?: unknown
  }) {
    super(params.message)
    this.name = 'AppError'
    this.statusCode = params.statusCode
    this.code = params.code
    this.details = params.details
  }
}

export const isAppError = (err: unknown): err is AppError => err instanceof AppError

/**
 * Ошибка API, нормализованная из backend-формата
 *   { error: { code, message, details } }
 *
 * Позволяет компонентам switch'иться по `code` для специфичных UX
 * (SMS_RATE_LIMITED → показать таймер, INVALID_CREDENTIALS → shake и т.д.)
 * вместо парсинга message.
 */
export class AppError extends Error {
  readonly code: string
  readonly statusCode: number
  readonly details: unknown

  constructor(args: { code: string; message: string; statusCode: number; details?: unknown }) {
    super(args.message)
    this.name = 'AppError'
    this.code = args.code
    this.statusCode = args.statusCode
    this.details = args.details
  }
}

/** Сетевая ошибка (fetch упал до ответа сервера). */
export class NetworkError extends Error {
  constructor(message = 'Network error') {
    super(message)
    this.name = 'NetworkError'
  }
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError
}

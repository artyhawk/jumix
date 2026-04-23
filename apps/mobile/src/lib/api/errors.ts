/**
 * API error — mirrors web/api-client backend envelope
 * `{error: {code, message, details}}`.
 */
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError
}

export class NetworkError extends Error {
  constructor(message = 'Нет соединения') {
    super(message)
    this.name = 'NetworkError'
  }
}

export function isNetworkError(err: unknown): err is NetworkError {
  return err instanceof NetworkError
}

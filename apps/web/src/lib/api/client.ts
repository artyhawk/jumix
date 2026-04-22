import { env } from '@/config/env'
import { AppError, NetworkError } from './errors'

export interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  /** Пропустить Authorization header (используется для /auth/* endpoints). */
  skipAuth?: boolean
  /** Пропустить авто-refresh при 401 (используется внутри самого refresh'а). */
  skipRefresh?: boolean
  /** X-Organization-Id header для operator multi-org context (ADR 0003). */
  organizationId?: string
}

/** Хуки для cross-cutting concerns — внедряются из auth-store (избегаем круговой импорт). */
interface ApiHooks {
  getAccessToken: () => string | null
  refresh: () => Promise<boolean>
  onUnauthorized: () => void
}

let hooks: ApiHooks = {
  getAccessToken: () => null,
  refresh: async () => false,
  onUnauthorized: () => {},
}

/** Регистрируется из AuthProvider на mount. */
export function registerApiHooks(next: ApiHooks) {
  hooks = next
}

function buildUrl(path: string): string {
  if (path.startsWith('http')) return path
  const base = env.NEXT_PUBLIC_API_URL.replace(/\/$/, '')
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${base}${suffix}`
}

async function rawFetch<T>(path: string, options: ApiFetchOptions): Promise<T> {
  const headers = new Headers(options.headers)
  headers.set('accept', 'application/json')

  let body: BodyInit | undefined
  if (options.body !== undefined && options.body !== null) {
    if (options.body instanceof FormData) {
      body = options.body
    } else {
      headers.set('content-type', 'application/json')
      body = JSON.stringify(options.body)
    }
  }

  if (!options.skipAuth) {
    const token = hooks.getAccessToken()
    if (token) headers.set('authorization', `Bearer ${token}`)
  }

  if (options.organizationId) {
    headers.set('x-organization-id', options.organizationId)
  }

  let response: Response
  try {
    response = await fetch(buildUrl(path), {
      ...options,
      headers,
      body,
    })
  } catch {
    throw new NetworkError()
  }

  if (response.status === 204) return undefined as T

  const text = await response.text()
  const payload: unknown = text ? safeJson(text) : null

  if (!response.ok) {
    const errObj = isRecord(payload) && isRecord(payload.error) ? payload.error : null
    throw new AppError({
      statusCode: response.status,
      code: typeof errObj?.code === 'string' ? errObj.code : `HTTP_${response.status}`,
      message:
        typeof errObj?.message === 'string'
          ? errObj.message
          : `Request failed with ${response.status}`,
      details: errObj?.details,
    })
  }

  return payload as T
}

/**
 * Основной клиент. На 401 один раз пытается обновить токен и повторить запрос.
 * Если refresh провалился — очищает auth-store (через hooks.onUnauthorized)
 * и бросает исходную 401-ошибку.
 */
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  try {
    return await rawFetch<T>(path, options)
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 401 && !options.skipRefresh) {
      const refreshed = await hooks.refresh()
      if (refreshed) {
        return await rawFetch<T>(path, { ...options, skipRefresh: true })
      }
      hooks.onUnauthorized()
    }
    throw error
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

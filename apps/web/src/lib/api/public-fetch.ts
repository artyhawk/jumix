import { env } from '@/config/env'
import { AppError, NetworkError } from './errors'

/**
 * Минимальный fetch-wrapper для public API endpoints — без attachment токена,
 * без refresh-flow. Используется на public marketing-страницах (B3-SURVEY).
 *
 * Совпадает по shape с apiFetch для error normalization, чтобы вызывающие
 * могли единообразно catch'ить AppError.
 */
export interface PublicFetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
}

function buildUrl(path: string): string {
  if (path.startsWith('http')) return path
  const base = env.NEXT_PUBLIC_API_URL.replace(/\/$/, '')
  const suffix = path.startsWith('/') ? path : `/${path}`
  return `${base}${suffix}`
}

export async function publicFetch<T>(path: string, options: PublicFetchOptions = {}): Promise<T> {
  const headers = new Headers(options.headers)
  headers.set('accept', 'application/json')

  let body: BodyInit | undefined
  if (options.body !== undefined && options.body !== null) {
    headers.set('content-type', 'application/json')
    body = JSON.stringify(options.body)
  }

  let response: Response
  try {
    response = await fetch(buildUrl(path), { ...options, headers, body })
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

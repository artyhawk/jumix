import { useAuthStore } from '@/stores/auth'
import * as SecureStore from 'expo-secure-store'
import { ApiError, NetworkError } from './errors'

/**
 * Mobile API client (M1). Mirrors web apiFetch pattern: auth header
 * injection из Zustand store; 401 → single-flight refresh → retry
 * original request.
 *
 * Differences vs web:
 *  - Base URL из `EXPO_PUBLIC_API_URL` (expo-style env injection)
 *  - Refresh token читаем из SecureStore напрямую (не из store — store
 *    хранит только user + access; refresh хранится в keychain)
 *  - NetworkError отдельный класс для offline detection (toast UX)
 */

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'
const REFRESH_KEY = 'jumix.refresh'

interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  body?: unknown
  /** Пропустить Authorization header (для /auth/* endpoints). */
  skipAuth?: boolean
  /** Пропустить авто-refresh при 401 (внутри refresh-flow чтобы избежать loop). */
  skipRefresh?: boolean
}

/**
 * Single-flight refresh promise. Если несколько параллельных запросов
 * получают 401 одновременно — только один инициирует refresh, остальные
 * ждут на том же promise.
 */
let refreshingPromise: Promise<boolean> | null = null

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { body, headers, skipAuth, skipRefresh, ...rest } = options
  const accessToken = useAuthStore.getState().accessToken

  const requestHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...(headers as Record<string, string> | undefined),
  }
  if (body !== undefined) {
    requestHeaders['Content-Type'] = 'application/json'
  }
  if (!skipAuth && accessToken) {
    requestHeaders.Authorization = `Bearer ${accessToken}`
  }

  let response: Response
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...rest,
      headers: requestHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch {
    // fetch throws TypeError на offline / DNS fails / abort.
    throw new NetworkError()
  }

  if (response.status === 401 && !skipAuth && !skipRefresh && accessToken) {
    const refreshed = await attemptRefresh()
    if (refreshed) {
      return apiFetch<T>(path, { ...options, skipRefresh: true })
    }
    // Refresh failed → clear session, пробрасываем 401.
    await useAuthStore.getState().logout()
    throw new ApiError('UNAUTHORIZED', 'Сессия истекла', 401)
  }

  if (response.status === 204) {
    // biome-ignore lint/suspicious/noExplicitAny: 204 означает отсутствие body; caller должен знать
    return undefined as any
  }

  const contentType = response.headers.get('content-type') ?? ''
  const isJson = contentType.includes('application/json')

  if (!response.ok) {
    let errorCode = 'UNKNOWN_ERROR'
    let errorMessage = 'Ошибка сервера'
    let errorDetails: unknown
    if (isJson) {
      try {
        const parsed = (await response.json()) as {
          error?: { code?: string; message?: string; details?: unknown }
        }
        if (parsed.error) {
          errorCode = parsed.error.code ?? errorCode
          errorMessage = parsed.error.message ?? errorMessage
          errorDetails = parsed.error.details
        }
      } catch {
        // Non-standard error envelope — оставляем defaults
      }
    }
    throw new ApiError(errorCode, errorMessage, response.status, errorDetails)
  }

  if (!isJson) {
    // biome-ignore lint/suspicious/noExplicitAny: rare case, caller typed
    return undefined as any
  }

  return (await response.json()) as T
}

async function attemptRefresh(): Promise<boolean> {
  if (refreshingPromise) return refreshingPromise

  refreshingPromise = (async () => {
    try {
      const refresh = await SecureStore.getItemAsync(REFRESH_KEY)
      if (!refresh) return false

      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ refreshToken: refresh, clientKind: 'mobile' }),
      })
      if (!response.ok) return false

      const data = (await response.json()) as {
        accessToken: string
        refreshToken: string
      }
      await SecureStore.setItemAsync(REFRESH_KEY, data.refreshToken)
      useAuthStore.getState().setAccessToken(data.accessToken)
      return true
    } catch {
      return false
    } finally {
      refreshingPromise = null
    }
  })()

  return refreshingPromise
}

/** Test-only helper — reset single-flight promise между тестами. */
export function __resetApiClient(): void {
  refreshingPromise = null
}

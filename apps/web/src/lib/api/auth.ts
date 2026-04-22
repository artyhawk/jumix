import { apiFetch } from './client'
import type { AuthMeResponse, ClientKind, LoginResponse, RefreshResponse } from './types'

/**
 * Тонкие враппы над backend auth endpoints. Логика (валидация, токены)
 * — в auth-store и компонентах; тут — только сетевой слой.
 */

export function requestSmsCode(phone: string) {
  return apiFetch<{ ok: true }>('/auth/sms/request', {
    method: 'POST',
    skipAuth: true,
    body: { phone },
  })
}

export function verifySmsCode(args: {
  phone: string
  code: string
  clientKind?: ClientKind
  deviceId?: string
}) {
  return apiFetch<LoginResponse>('/auth/sms/verify', {
    method: 'POST',
    skipAuth: true,
    body: {
      phone: args.phone,
      code: args.code,
      clientKind: args.clientKind ?? 'web',
      ...(args.deviceId ? { deviceId: args.deviceId } : {}),
    },
  })
}

export function passwordLogin(args: {
  phone: string
  password: string
  clientKind?: ClientKind
  deviceId?: string
}) {
  return apiFetch<LoginResponse>('/auth/login', {
    method: 'POST',
    skipAuth: true,
    body: {
      phone: args.phone,
      password: args.password,
      clientKind: args.clientKind ?? 'web',
      ...(args.deviceId ? { deviceId: args.deviceId } : {}),
    },
  })
}

export function refreshTokens(args: {
  refreshToken: string
  clientKind?: ClientKind
  deviceId?: string
}) {
  return apiFetch<RefreshResponse>('/auth/refresh', {
    method: 'POST',
    skipAuth: true,
    skipRefresh: true,
    body: {
      refreshToken: args.refreshToken,
      clientKind: args.clientKind ?? 'web',
      ...(args.deviceId ? { deviceId: args.deviceId } : {}),
    },
  })
}

export function logout(refreshToken: string) {
  return apiFetch<{ ok: true }>('/auth/logout', {
    method: 'POST',
    skipAuth: true,
    skipRefresh: true,
    body: { refreshToken },
  })
}

export function getMe() {
  return apiFetch<AuthMeResponse>('/auth/me', { method: 'GET' })
}

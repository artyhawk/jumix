import type { AuthUser } from '@/stores/auth'
import { apiFetch } from './client'

/**
 * Auth endpoints client wrapper (M1). `clientKind: 'mobile'` посылается
 * в каждом вызове — backend выбирает refresh TTL 90 дней (vs web 30).
 */

interface TokenResponse {
  accessToken: string
  refreshToken: string
  accessTokenExpiresAt: string
  refreshTokenExpiresAt: string
  user: AuthUser
}

export async function requestSmsCode(phone: string): Promise<{ ok: true }> {
  return apiFetch('/auth/sms/request', {
    method: 'POST',
    body: { phone },
    skipAuth: true,
  })
}

export async function verifySmsCode(params: {
  phone: string
  code: string
  deviceId?: string
}): Promise<TokenResponse> {
  return apiFetch('/auth/sms/verify', {
    method: 'POST',
    body: {
      phone: params.phone,
      code: params.code,
      clientKind: 'mobile' as const,
      ...(params.deviceId ? { deviceId: params.deviceId } : {}),
    },
    skipAuth: true,
  })
}

export async function logout(refreshToken: string): Promise<{ ok: true }> {
  return apiFetch('/auth/logout', {
    method: 'POST',
    body: { refreshToken },
    skipAuth: true,
  })
}

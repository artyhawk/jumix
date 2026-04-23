import type { AuthUser } from '@/stores/auth'
import { apiFetch } from './client'

/**
 * Public registration endpoints (ADR 0004). Двухфазный flow:
 *   1. POST /api/v1/registration/start — отправить OTP на phone.
 *      Ответ: 202 Accepted (enumeration protection — всегда 202).
 *   2. POST /api/v1/registration/verify — OTP + identity (ФИО + ИИН) →
 *      user + crane_profile (pending) + token pair.
 *
 * Mobile UX собирает identity на одном экране вместе с OTP — split
 * трёхфазного flow потребовал бы temp-token без UX-выигрыша (см. ADR 0004).
 */

export async function startRegistration(phone: string): Promise<{ status: 'accepted' }> {
  return apiFetch('/api/v1/registration/start', {
    method: 'POST',
    body: { phone },
    skipAuth: true,
  })
}

interface VerifyRegistrationInput {
  phone: string
  otp: string
  firstName: string
  lastName: string
  patronymic?: string
  iin: string
  deviceId?: string
}

interface VerifyRegistrationResponse {
  accessToken: string
  refreshToken: string
  accessTokenExpiresAt: string
  refreshTokenExpiresAt: string
  user: AuthUser
  craneProfile: {
    id: string
    approvalStatus: 'pending' | 'approved' | 'rejected'
  }
}

export async function verifyRegistration(
  input: VerifyRegistrationInput,
): Promise<VerifyRegistrationResponse> {
  return apiFetch('/api/v1/registration/verify', {
    method: 'POST',
    body: {
      phone: input.phone,
      otp: input.otp,
      firstName: input.firstName,
      lastName: input.lastName,
      ...(input.patronymic ? { patronymic: input.patronymic } : {}),
      iin: input.iin,
      clientKind: 'mobile' as const,
      ...(input.deviceId ? { deviceId: input.deviceId } : {}),
    },
    skipAuth: true,
  })
}

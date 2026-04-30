import { apiFetch } from './client'
import type { AuthUser, ThemeMode } from './types'

/**
 * B3-THEME — user preferences API. Только theme в MVP.
 *
 * Возвращает обновлённого `user` (с новой `themeMode`). Caller обновляет
 * `useAuthStore` через `patchUser` — auth-store автоматически persist'ит в
 * localStorage.
 */

export function updatePreferences(payload: { themeMode: ThemeMode }) {
  return apiFetch<{ user: AuthUser }>('/me/preferences', {
    method: 'PATCH',
    body: payload,
  })
}

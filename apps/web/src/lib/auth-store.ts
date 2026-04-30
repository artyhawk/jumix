'use client'

import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { logout as logoutApi, refreshTokens } from './api/auth'
import type { AuthUser } from './api/types'

/**
 * Auth state хранится в localStorage (MVP). Миграция на httpOnly cookie —
 * в backlog (требует backend endpoint set-cookie при login/refresh).
 *
 * Rotation toggle: refresh может race'иться (несколько параллельных 401-ов
 * на разных запросах). `refreshing` promise десингулиризирует это — все
 * ждут одного refresh-вызова.
 */
interface AuthState {
  accessToken: string | null
  refreshToken: string | null
  accessTokenExpiresAt: string | null
  refreshTokenExpiresAt: string | null
  user: AuthUser | null
  hydrated: boolean
}

interface AuthActions {
  setSession: (session: {
    accessToken: string
    refreshToken: string
    accessTokenExpiresAt: string
    refreshTokenExpiresAt: string
    user: AuthUser
  }) => void
  updateTokens: (session: {
    accessToken: string
    refreshToken: string
    accessTokenExpiresAt: string
    refreshTokenExpiresAt: string
  }) => void
  /** Обновляет subset полей user без затрагивания tokens. Используется для
   *  preferences-sync (B3-THEME): после PATCH /me/preferences кладём свежий
   *  user в store, persist подхватывает в localStorage. */
  patchUser: (patch: Partial<AuthUser>) => void
  clear: () => void
  refresh: () => Promise<boolean>
  logout: () => Promise<void>
  markHydrated: () => void
}

type AuthStore = AuthState & AuthActions

const initialState: AuthState = {
  accessToken: null,
  refreshToken: null,
  accessTokenExpiresAt: null,
  refreshTokenExpiresAt: null,
  user: null,
  hydrated: false,
}

let refreshingPromise: Promise<boolean> | null = null

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      setSession: (s) =>
        set({
          accessToken: s.accessToken,
          refreshToken: s.refreshToken,
          accessTokenExpiresAt: s.accessTokenExpiresAt,
          refreshTokenExpiresAt: s.refreshTokenExpiresAt,
          user: s.user,
        }),

      updateTokens: (s) =>
        set({
          accessToken: s.accessToken,
          refreshToken: s.refreshToken,
          accessTokenExpiresAt: s.accessTokenExpiresAt,
          refreshTokenExpiresAt: s.refreshTokenExpiresAt,
        }),

      patchUser: (patch) => {
        const cur = get().user
        if (!cur) return
        set({ user: { ...cur, ...patch } })
      },

      clear: () =>
        set({
          accessToken: null,
          refreshToken: null,
          accessTokenExpiresAt: null,
          refreshTokenExpiresAt: null,
          user: null,
        }),

      refresh: async () => {
        if (refreshingPromise) return refreshingPromise
        const token = get().refreshToken
        if (!token) return false

        refreshingPromise = (async () => {
          try {
            const tokens = await refreshTokens({ refreshToken: token, clientKind: 'web' })
            get().updateTokens(tokens)
            return true
          } catch {
            get().clear()
            return false
          } finally {
            refreshingPromise = null
          }
        })()

        return refreshingPromise
      },

      logout: async () => {
        const token = get().refreshToken
        if (token) {
          try {
            await logoutApi(token)
          } catch {
            // Даже если revoke не прошёл — чистим локально.
          }
        }
        get().clear()
      },

      markHydrated: () => set({ hydrated: true }),
    }),
    {
      name: 'jumix-auth',
      storage: createJSONStorage(() => {
        if (typeof window === 'undefined') {
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
          }
        }
        return window.localStorage
      }),
      partialize: (s) => ({
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        accessTokenExpiresAt: s.accessTokenExpiresAt,
        refreshTokenExpiresAt: s.refreshTokenExpiresAt,
        user: s.user,
      }),
      onRehydrateStorage: () => (state) => {
        state?.markHydrated()
      },
    },
  ),
)

/** Селектор: залогинен ли пользователь. */
export const selectIsAuthenticated = (s: AuthStore) => Boolean(s.accessToken && s.user)

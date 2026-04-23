import * as SecureStore from 'expo-secure-store'
import { create } from 'zustand'

/**
 * Auth store (M1, Zustand + SecureStore).
 *
 * Token strategy:
 *  - access — memory only (короткий TTL ~15 мин, часто ротируется, утечка
 *    в XSS/jailbreak = минимальный ущерб);
 *  - refresh — SecureStore (iOS Keychain, Android EncryptedSharedPreferences,
 *    hardware-encrypted при наличии Secure Enclave);
 *  - user — SecureStore JSON (чтобы восстановить identity после рестарта
 *    без лишнего round-trip; обновляется через login/refresh).
 *
 * Cold start flow:
 *   1. hydrate() → читаем refresh + user из SecureStore
 *   2. если refresh есть → POST /auth/refresh → получаем новую access+refresh
 *      пару → сохраняем refresh обратно в SecureStore, access в memory
 *   3. если refresh нет или refresh failed → clearing state + isHydrated=true
 *      → navigation ведёт на /login
 */

export type UserRole = 'superadmin' | 'owner' | 'operator'

export interface AuthUser {
  id: string
  phone: string
  role: UserRole
  organizationId: string | null
  name: string
}

interface TokenPair {
  access: string
  refresh: string
}

interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  isHydrated: boolean

  login: (tokens: TokenPair, user: AuthUser) => Promise<void>
  logout: () => Promise<void>
  hydrate: () => Promise<void>
  setAccessToken: (token: string) => void
  setRefreshToken: (token: string) => Promise<void>
}

const REFRESH_KEY = 'jumix.refresh'
const USER_KEY = 'jumix.user'

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  isHydrated: false,

  async login(tokens, user) {
    await SecureStore.setItemAsync(REFRESH_KEY, tokens.refresh)
    await SecureStore.setItemAsync(USER_KEY, JSON.stringify(user))
    set({ user, accessToken: tokens.access })
  },

  async logout() {
    await SecureStore.deleteItemAsync(REFRESH_KEY)
    await SecureStore.deleteItemAsync(USER_KEY)
    set({ user: null, accessToken: null })
  },

  async hydrate() {
    const [refresh, userJson] = await Promise.all([
      SecureStore.getItemAsync(REFRESH_KEY),
      SecureStore.getItemAsync(USER_KEY),
    ])
    if (!refresh || !userJson) {
      set({ isHydrated: true, user: null, accessToken: null })
      return
    }

    let cachedUser: AuthUser
    try {
      cachedUser = JSON.parse(userJson) as AuthUser
    } catch {
      // Corrupted cache — start clean
      await SecureStore.deleteItemAsync(REFRESH_KEY)
      await SecureStore.deleteItemAsync(USER_KEY)
      set({ isHydrated: true, user: null, accessToken: null })
      return
    }

    try {
      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refresh, clientKind: 'mobile' }),
      })
      if (!response.ok) throw new Error('refresh failed')
      const data = (await response.json()) as {
        accessToken: string
        refreshToken: string
      }
      await SecureStore.setItemAsync(REFRESH_KEY, data.refreshToken)
      set({
        user: cachedUser,
        accessToken: data.accessToken,
        isHydrated: true,
      })
    } catch {
      await SecureStore.deleteItemAsync(REFRESH_KEY)
      await SecureStore.deleteItemAsync(USER_KEY)
      set({ isHydrated: true, user: null, accessToken: null })
    }
  },

  setAccessToken(token) {
    set({ accessToken: token })
  },

  async setRefreshToken(token) {
    await SecureStore.setItemAsync(REFRESH_KEY, token)
  },
}))

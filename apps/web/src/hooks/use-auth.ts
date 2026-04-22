'use client'

import { selectIsAuthenticated, useAuthStore } from '@/lib/auth-store'

/** Удобный хук — объединяет state + селекторы. */
export function useAuth() {
  const user = useAuthStore((s) => s.user)
  const hydrated = useAuthStore((s) => s.hydrated)
  const isAuthenticated = useAuthStore(selectIsAuthenticated)
  const logout = useAuthStore((s) => s.logout)

  return { user, hydrated, isAuthenticated, logout }
}

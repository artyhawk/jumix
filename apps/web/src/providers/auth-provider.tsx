'use client'

import { registerApiHooks } from '@/lib/api/client'
import { useAuthStore } from '@/lib/auth-store'
import { useRouter } from 'next/navigation'
import { type ReactNode, useEffect } from 'react'

/**
 * Регистрирует api-client hooks (get token / refresh / 401-handler) при mount'е.
 * На 401 (после неудачного refresh) делает hard-redirect на /login.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter()

  useEffect(() => {
    registerApiHooks({
      getAccessToken: () => useAuthStore.getState().accessToken,
      refresh: () => useAuthStore.getState().refresh(),
      onUnauthorized: () => {
        useAuthStore.getState().clear()
        router.replace('/login')
      },
    })
  }, [router])

  return <>{children}</>
}

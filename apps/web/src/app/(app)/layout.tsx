'use client'

import { Shell } from '@/components/layout/shell'
import { Skeleton } from '@/components/ui/skeleton'
import { selectIsAuthenticated, useAuthStore } from '@/lib/auth-store'
import { useRouter } from 'next/navigation'
import { type ReactNode, useEffect } from 'react'

/**
 * Protected route group. Ждёт hydration, редиректит на /login если нет сессии.
 *
 * Пока идёт hydration — skeleton; иначе mismatch SSR (нет токена) / CSR (есть).
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter()
  const hydrated = useAuthStore((s) => s.hydrated)
  const isAuthed = useAuthStore(selectIsAuthenticated)
  const user = useAuthStore((s) => s.user)

  useEffect(() => {
    if (hydrated && !isAuthed) {
      router.replace('/login')
    }
  }, [hydrated, isAuthed, router])

  if (!hydrated) {
    return (
      <div className="min-h-dvh bg-layer-0 flex items-center justify-center p-4">
        <Skeleton className="h-4 w-32" />
      </div>
    )
  }

  if (!isAuthed || !user) return null

  return <Shell user={user}>{children}</Shell>
}

'use client'

import { selectIsAuthenticated, useAuthStore } from '@/lib/auth-store'
import { useRouter } from 'next/navigation'
import { type ReactNode, useEffect } from 'react'

/**
 * Auth-group layout. Если пользователь уже залогинен — редирект на /.
 * Ждём hydration из localStorage перед принятием решения (иначе SSR/CSR mismatch).
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  const router = useRouter()
  const hydrated = useAuthStore((s) => s.hydrated)
  const isAuthed = useAuthStore(selectIsAuthenticated)

  useEffect(() => {
    if (hydrated && isAuthed) {
      router.replace('/')
    }
  }, [hydrated, isAuthed, router])

  return (
    <div className="relative min-h-dvh bg-layer-0 text-text-primary flex flex-col">
      <div className="absolute inset-0 bg-grid-subtle pointer-events-none" aria-hidden />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(1200px circle at 50% -10%, rgba(249, 123, 16, 0.08), transparent 40%)',
        }}
        aria-hidden
      />
      <div className="relative flex-1 flex items-center justify-center p-4 md:p-6">{children}</div>
      <footer className="relative py-4 text-center text-[11px] text-text-tertiary">
        © Jumix 2026 · <span className="text-text-tertiary">Соглашение</span> ·{' '}
        <span className="text-text-tertiary">Конфиденциальность</span>
      </footer>
    </div>
  )
}

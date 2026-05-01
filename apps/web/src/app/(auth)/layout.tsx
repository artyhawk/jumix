'use client'

import { selectIsAuthenticated, useAuthStore } from '@/lib/auth-store'
import { MarketingLocaleProvider, useT } from '@/lib/marketing-locale'
import { useRouter } from 'next/navigation'
import { type ReactNode, useEffect } from 'react'
import { AuthLocaleSwitcher } from './_components/auth-locale-switcher'

/**
 * Auth-group layout. Если пользователь уже залогинен — редирект в его кабинет
 * (operator → /me, остальные → /dashboard). `/` теперь публичный marketing
 * landing (B3-LANDING), поэтому редирект сразу в кабинет, а не на root.
 *
 * Locale: переиспользуем `MarketingLocaleProvider` (тот же localStorage-ключ
 * `jumix-marketing-locale`) — выбор языка переносится между лендингом и
 * auth-страницами.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  const router = useRouter()
  const hydrated = useAuthStore((s) => s.hydrated)
  const isAuthed = useAuthStore(selectIsAuthenticated)
  const user = useAuthStore((s) => s.user)

  useEffect(() => {
    if (hydrated && isAuthed && user) {
      router.replace(user.role === 'operator' ? '/me' : '/dashboard')
    }
  }, [hydrated, isAuthed, user, router])

  return (
    <MarketingLocaleProvider>
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
        <div className="relative flex justify-end p-3 sm:p-4 md:p-6 pb-0">
          <AuthLocaleSwitcher />
        </div>
        <div className="relative flex-1 flex items-center justify-center p-3 sm:p-4 md:p-6">
          {children}
        </div>
        <AuthFooter />
      </div>
    </MarketingLocaleProvider>
  )
}

function AuthFooter() {
  const t = useT()
  return (
    <footer className="relative py-4 text-center text-[11px] text-text-tertiary">
      © Jumix 2026 · <span className="text-text-tertiary">{t('auth.login.footerTerms')}</span> ·{' '}
      <span className="text-text-tertiary">{t('auth.login.footerPrivacy')}</span>
    </footer>
  )
}

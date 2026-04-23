'use client'

import { useAuth } from '@/hooks/use-auth'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/**
 * Root `/` — role switch:
 *   superadmin → /dashboard (платформа, B3-UI-2)
 *   owner     → /dashboard (org-scoped, B3-UI-3a)
 *   operator  → /me        (self-profile, B3-UI-4; operator не имеет dashboard)
 */
export default function RootPage() {
  const { user } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!user) return
    if (user.role === 'superadmin' || user.role === 'owner') {
      router.replace('/dashboard')
      return
    }
    if (user.role === 'operator') {
      router.replace('/me')
    }
  }, [user, router])

  return null
}

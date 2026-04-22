'use client'

import { OwnerDashboard } from '@/components/dashboard/owner-dashboard'
import { SuperadminDashboard } from '@/components/dashboard/superadmin-dashboard'
import { useAuth } from '@/hooks/use-auth'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/**
 * Роль-свитч для dashboard. `operator` не имеет своего dashboard в web —
 * его весь workflow живёт в мобилке, так что redirect на `/`.
 */
export default function DashboardPage() {
  const { user } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (user && user.role !== 'superadmin' && user.role !== 'owner') router.replace('/')
  }, [user, router])

  if (!user) return null
  if (user.role === 'superadmin') return <SuperadminDashboard />
  if (user.role === 'owner') return <OwnerDashboard />
  return null
}

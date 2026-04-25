'use client'

import { OwnerDashboard } from '@/components/dashboard/owner-dashboard'
import { SuperadminDashboard } from '@/components/dashboard/superadmin-dashboard'
import { ShiftDrawer } from '@/components/drawers/shift-drawer'
import { useAuth } from '@/hooks/use-auth'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect } from 'react'

/**
 * Роль-свитч для dashboard. `operator` не имеет своего dashboard в web —
 * его весь workflow живёт в мобилке, так что redirect на `/`.
 *
 * Owner-flow: клик по live-крану на карте → `?shift=<id>` → ShiftDrawer
 * overlay. Закрытие — `?shift=` удаляется.
 */
export default function DashboardPage() {
  const { user } = useAuth()
  const router = useRouter()
  const params = useSearchParams()
  const shiftId = params.get('shift')

  useEffect(() => {
    if (user && user.role !== 'superadmin' && user.role !== 'owner') router.replace('/')
  }, [user, router])

  const handleShiftDrawerClose = (next: boolean) => {
    if (next) return
    const qs = new URLSearchParams(params.toString())
    qs.delete('shift')
    const search = qs.toString()
    router.replace(search ? `/dashboard?${search}` : '/dashboard', { scroll: false })
  }

  if (!user) return null

  return (
    <>
      {user.role === 'superadmin' ? <SuperadminDashboard /> : null}
      {user.role === 'owner' ? <OwnerDashboard /> : null}
      {user.role === 'owner' ? (
        <ShiftDrawer id={shiftId} onOpenChange={handleShiftDrawerClose} />
      ) : null}
    </>
  )
}

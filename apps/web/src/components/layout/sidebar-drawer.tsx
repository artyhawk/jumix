'use client'

import { DrawerOverlay } from '@/components/ui/drawer'
import type { UserRole } from '@/lib/api/types'
import * as RadixDialog from '@radix-ui/react-dialog'
import { usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { Logo } from './logo'
import { SidebarNav } from './sidebar-nav'

/**
 * Мобильный drawer-вариант sidebar. Триггерится hamburger в topbar,
 * закрывается автоматически при навигации (pathname change).
 */
export function SidebarDrawer({
  open,
  onOpenChange,
  role,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  role: UserRole
}) {
  const pathname = usePathname()

  // Auto-close при navigation: pathname меняется → закрываем.
  // biome-ignore lint/correctness/useExhaustiveDependencies: trigger only on pathname change
  useEffect(() => {
    if (open) onOpenChange(false)
  }, [pathname])

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <DrawerOverlay />
        <RadixDialog.Content
          className="fixed inset-y-0 left-0 z-50 h-dvh w-[280px] bg-layer-1 border-r border-border-default shadow-2xl anim-slide-left flex flex-col focus:outline-none md:hidden"
          aria-label="Навигация"
        >
          <RadixDialog.Title className="sr-only">Навигация</RadixDialog.Title>
          <div className="h-14 flex items-center px-4 border-b border-border-subtle">
            <Logo variant="full" />
          </div>
          <div className="flex-1 overflow-y-auto">
            <SidebarNav role={role} onNavigate={() => onOpenChange(false)} />
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}

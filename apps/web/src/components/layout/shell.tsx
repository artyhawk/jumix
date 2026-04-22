'use client'

import { CommandPalette } from '@/components/ui/command-palette'
import { TooltipProvider } from '@/components/ui/tooltip'
import type { AuthUser } from '@/lib/api/types'
import { Sidebar } from './sidebar'
import { Topbar } from './topbar'

/**
 * Authenticated shell: sidebar (desktop) + topbar + main. На mobile sidebar
 * скрыт, drawer открывается через hamburger в topbar.
 */
export function Shell({
  user,
  children,
}: {
  user: AuthUser
  children: React.ReactNode
}) {
  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex min-h-dvh bg-layer-0">
        <Sidebar role={user.role} />
        <div className="flex-1 flex flex-col min-w-0">
          <Topbar user={user} />
          <main className="flex-1 overflow-x-hidden">
            <div className="mx-auto max-w-7xl p-4 md:p-8 space-y-6 md:space-y-8">{children}</div>
          </main>
        </div>
      </div>
      <CommandPalette />
    </TooltipProvider>
  )
}

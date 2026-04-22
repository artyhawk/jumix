'use client'

import { Button } from '@/components/ui/button'
import { Tooltip } from '@/components/ui/tooltip'
import { useKeyboard } from '@/hooks/use-keyboard'
import type { UserRole } from '@/lib/api/types'
import { cn } from '@/lib/utils'
import { ChevronsLeft, ChevronsRight, Globe } from 'lucide-react'
import { useState } from 'react'
import { Logo } from './logo'
import { SidebarNav } from './sidebar-nav'

/**
 * Desktop sidebar (≥md). Collapse через `[`-shortcut или chevron.
 * Мобильная версия — sidebar-drawer.tsx (слайд-drawer).
 */
export function Sidebar({ role }: { role: UserRole }) {
  const [collapsed, setCollapsed] = useState(false)

  useKeyboard('[', () => setCollapsed((v) => !v))

  return (
    <aside
      className={cn(
        'hidden md:flex flex-col shrink-0 border-r border-border-subtle bg-layer-1',
        'transition-[width] duration-250 ease-out',
        collapsed ? 'w-[64px]' : 'w-[240px]',
      )}
      aria-label="Боковое меню"
    >
      <div
        className={cn(
          'h-14 flex items-center border-b border-border-subtle shrink-0',
          collapsed ? 'justify-center' : 'px-4',
        )}
      >
        {collapsed ? <Logo variant="mark" priority /> : <Logo variant="full" priority />}
      </div>

      <div className="flex-1 overflow-y-auto">
        <SidebarNav role={role} collapsed={collapsed} />
      </div>

      <div
        className={cn(
          'border-t border-border-subtle p-2 flex gap-1',
          collapsed ? 'flex-col items-center' : 'items-center justify-between',
        )}
      >
        <Tooltip label="Язык (скоро)" side="right">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded px-2 py-1 text-xs font-medium text-text-tertiary hover:text-text-primary hover:bg-layer-2 transition-colors"
            disabled
          >
            <Globe className="size-3.5" aria-hidden />
            {!collapsed && <span>RU</span>}
          </button>
        </Tooltip>

        <Tooltip label={collapsed ? 'Развернуть ([)' : 'Свернуть ([)'} side="right">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed((v) => !v)}
            aria-label="Свернуть меню"
            className="size-8"
          >
            {collapsed ? (
              <ChevronsRight className="size-4" strokeWidth={1.5} />
            ) : (
              <ChevronsLeft className="size-4" strokeWidth={1.5} />
            )}
          </Button>
        </Tooltip>
      </div>
    </aside>
  )
}

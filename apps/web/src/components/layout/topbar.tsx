'use client'

import { ThemeToggle } from '@/components/theme-toggle'
import { Avatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DensityToggle } from '@/components/ui/density-toggle'
import {
  DropdownContent,
  DropdownItem,
  DropdownLabel,
  DropdownRoot,
  DropdownSeparator,
  DropdownTrigger,
} from '@/components/ui/dropdown'
import { useAuth } from '@/hooks/use-auth'
import type { AuthUser } from '@/lib/api/types'
import { t } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { Bell, Menu, Search } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { SidebarDrawer } from './sidebar-drawer'

export function Topbar({ user }: { user: AuthUser }) {
  const pathname = usePathname()
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { logout } = useAuth()

  const pageTitle = prettifyPath(pathname)

  return (
    <>
      <header className="h-14 shrink-0 border-b border-border-subtle bg-layer-0/80 backdrop-blur supports-[backdrop-filter]:bg-layer-0/60 sticky top-0 z-30">
        <div className="h-full flex items-center gap-2 px-3 md:px-6">
          {/* Hamburger — только mobile */}
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden size-10"
            onClick={() => setDrawerOpen(true)}
            aria-label="Открыть меню"
          >
            <Menu className="size-5" strokeWidth={1.5} />
          </Button>

          {/* Mobile title / Desktop breadcrumbs */}
          <div className="flex-1 min-w-0">
            <div className="md:hidden truncate text-sm font-semibold">{pageTitle}</div>
            <nav
              aria-label="Путь"
              className="hidden md:flex items-center gap-2 text-sm text-text-secondary"
            >
              <span className="text-text-tertiary">Jumix</span>
              <span className="text-text-tertiary">/</span>
              <span className="text-text-primary">{pageTitle}</span>
            </nav>
          </div>

          {/* Global search trigger (Cmd+K) */}
          <button
            type="button"
            className={cn(
              'inline-flex items-center gap-2 rounded-md',
              'h-9 px-2.5 text-sm',
              'bg-layer-2 border border-border-subtle hover:border-border-default transition-colors',
              'text-text-tertiary',
              'md:min-w-[200px] md:justify-between',
            )}
            onClick={() => {
              // dispatch cmd+k — command palette hook слушает его
              window.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }),
              )
            }}
            aria-label="Открыть командную палитру"
          >
            <span className="inline-flex items-center gap-2">
              <Search className="size-4" aria-hidden />
              <span className="hidden md:inline">Поиск…</span>
            </span>
            <kbd className="hidden md:inline-flex items-center gap-0.5 rounded border border-border-default bg-layer-3 px-1.5 py-0.5 font-mono text-[10px]">
              ⌘K
            </kbd>
          </button>

          {/* Density toggle — desktop only; на mobile cards всегда comfortable */}
          <DensityToggle className="hidden md:inline-flex" />

          {/* Theme toggle (B3-THEME) */}
          <ThemeToggle />

          {/* Notifications */}
          <DropdownRoot>
            <DropdownTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Уведомления"
                className="size-10 md:size-9 relative"
              >
                <Bell className="size-5 md:size-[18px]" strokeWidth={1.5} />
              </Button>
            </DropdownTrigger>
            <DropdownContent align="end" className="w-[280px]">
              <DropdownLabel>Уведомления</DropdownLabel>
              <DropdownSeparator />
              <div className="py-6 text-center text-sm text-text-tertiary">
                Пока нет уведомлений
              </div>
            </DropdownContent>
          </DropdownRoot>

          {/* User menu */}
          <DropdownRoot>
            <DropdownTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-md p-1 hover:bg-layer-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
                aria-label="Меню пользователя"
              >
                <Avatar name={user.name} userId={user.id} size="md" />
              </button>
            </DropdownTrigger>
            <DropdownContent align="end" className="w-[220px]">
              <div className="px-2 py-2 flex flex-col gap-1">
                <div className="text-sm font-medium text-text-primary truncate">{user.name}</div>
                <Badge variant="neutral" withDot={false} className="self-start">
                  {t(`roles.${user.role}`)}
                </Badge>
              </div>
              <DropdownSeparator />
              <DropdownItem
                onSelect={() => {
                  void logout()
                }}
                destructive
              >
                {t('common.signOut')}
              </DropdownItem>
            </DropdownContent>
          </DropdownRoot>
        </div>
      </header>

      <SidebarDrawer open={drawerOpen} onOpenChange={setDrawerOpen} role={user.role} />
    </>
  )
}

function prettifyPath(pathname: string): string {
  if (pathname === '/' || pathname === '') return 'Обзор'
  const last = pathname.split('/').filter(Boolean).pop()
  if (!last) return 'Обзор'
  return last.charAt(0).toUpperCase() + last.slice(1)
}

'use client'

import { useAuth } from '@/hooks/use-auth'
import { useKeyboard } from '@/hooks/use-keyboard'
import { cn } from '@/lib/utils'
import * as RadixDialog from '@radix-ui/react-dialog'
import { Command } from 'cmdk'
import { LayoutDashboard, LogOut, Search, ShieldCheck } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { DialogOverlay, DialogRoot } from './dialog'

/**
 * Cmd+K палитра. Superadmin commands добавлены в B3-UI-2b; full role-aware
 * registry — в B3-UI-2d.
 *
 * Keyboard binding Cmd+K / Ctrl+K открывает палитру глобально.
 */
interface PaletteCommand {
  id: string
  label: string
  icon?: React.ReactNode
  action: () => void
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const { user, logout } = useAuth()

  useKeyboard('cmd+k', (e) => {
    e.preventDefault()
    setOpen((v) => !v)
  })

  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open])

  const commands = useMemo<PaletteCommand[]>(() => {
    const run = (fn: () => void) => () => {
      setOpen(false)
      fn()
    }
    const list: PaletteCommand[] = []
    if (user?.role === 'superadmin') {
      list.push(
        {
          id: 'nav:dashboard',
          label: 'Перейти к обзору',
          icon: <LayoutDashboard className="size-4" strokeWidth={1.5} aria-hidden />,
          action: run(() => router.push('/dashboard')),
        },
        {
          id: 'nav:approvals',
          label: 'Перейти к заявкам',
          icon: <ShieldCheck className="size-4" strokeWidth={1.5} aria-hidden />,
          action: run(() => router.push('/approvals')),
        },
      )
    }
    if (user) {
      list.push({
        id: 'session:logout',
        label: 'Выйти',
        icon: <LogOut className="size-4" strokeWidth={1.5} aria-hidden />,
        action: run(() => {
          void logout()
          router.push('/login')
        }),
      })
    }
    return list
  }, [user, logout, router])

  return (
    <DialogRoot open={open} onOpenChange={setOpen}>
      <RadixDialog.Portal>
        <DialogOverlay />
        <RadixDialog.Content
          className={cn(
            'fixed left-1/2 top-[15%] -translate-x-1/2 z-50',
            'w-[calc(100vw-32px)] max-w-xl',
            'rounded-[12px] border border-border-default bg-layer-2 shadow-2xl shadow-black/50',
            'anim-fade-zoom',
            'focus:outline-none',
          )}
          aria-label="Командная палитра"
        >
          <Command className="flex flex-col overflow-hidden rounded-[12px]" loop>
            <div className="flex items-center gap-2 border-b border-border-subtle px-3">
              <Search className="size-4 text-text-tertiary" aria-hidden />
              <Command.Input
                placeholder="Поиск команд…"
                className="flex-1 h-12 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
              />
              <kbd className="hidden md:inline-flex items-center gap-1 rounded border border-border-default bg-layer-3 px-1.5 py-0.5 font-mono text-[10px] text-text-tertiary">
                ESC
              </kbd>
            </div>
            <Command.List className="max-h-[320px] overflow-auto p-2">
              <Command.Empty className="py-8 text-center text-sm text-text-tertiary">
                Ничего не найдено
              </Command.Empty>
              {commands.map((cmd) => (
                <Command.Item
                  key={cmd.id}
                  value={cmd.label}
                  onSelect={cmd.action}
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-text-primary data-[selected=true]:bg-layer-3 cursor-pointer"
                >
                  <span className="text-text-tertiary">{cmd.icon}</span>
                  <span>{cmd.label}</span>
                </Command.Item>
              ))}
            </Command.List>
          </Command>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </DialogRoot>
  )
}

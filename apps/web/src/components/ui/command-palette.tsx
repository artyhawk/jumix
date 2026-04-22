'use client'

import { useKeyboard } from '@/hooks/use-keyboard'
import { cn } from '@/lib/utils'
import * as RadixDialog from '@radix-ui/react-dialog'
import { Command } from 'cmdk'
import { Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { DialogOverlay, DialogRoot } from './dialog'

/**
 * Cmd+K палитра. В B3-UI-1 это scaffold с empty state — реальные команды
 * появляются в последующих вертикалях (B3-UI-2/3/4) когда у нас есть routes.
 *
 * Keyboard binding Cmd+K / Ctrl+K открывает палитру глобально.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false)

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
                Команды появятся в следующих релизах.
              </Command.Empty>
            </Command.List>
          </Command>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </DialogRoot>
  )
}

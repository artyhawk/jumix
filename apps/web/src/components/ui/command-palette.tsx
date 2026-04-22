'use client'

import { useKeyboard } from '@/hooks/use-keyboard'
import {
  COMMAND_GROUP_LABELS,
  COMMAND_GROUP_ORDER,
  type CommandEntry,
  type CommandGroup,
} from '@/lib/commands/registry'
import { useCommands } from '@/lib/commands/use-commands'
import { cn } from '@/lib/utils'
import { Command as CmdkRoot } from 'cmdk'
import { AnimatePresence, motion } from 'framer-motion'
import { Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

/**
 * Cmd+K палитра — role-aware registry + cmdk fuzzy search. Keywords
 * concatenated в `value`, cmdk ищет по всей строке → "одоб" находит
 * "Заявки на рассмотрение" через keyword "одобрение".
 *
 * Motion: framer-motion spring modal (stiffness 340 damping 28) + backdrop
 * blur fade. Не CSS transitions.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const { commands, execute } = useCommands()

  useKeyboard('cmd+k', (e) => {
    e.preventDefault()
    setOpen((v) => !v)
  })

  useEffect(() => {
    if (!open) {
      setQuery('')
      return
    }
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  const grouped = useMemo(() => {
    const map = new Map<CommandGroup, CommandEntry[]>()
    for (const g of COMMAND_GROUP_ORDER) map.set(g, [])
    for (const cmd of commands) {
      const arr = map.get(cmd.group)
      if (arr) arr.push(cmd)
    }
    return COMMAND_GROUP_ORDER.map((g) => [g, map.get(g) ?? []] as const).filter(
      ([, items]) => items.length > 0,
    )
  }, [commands])

  const handleSelect = (cmd: CommandEntry) => {
    setOpen(false)
    // Короткий timeout чтобы modal успел закрыться перед navigation — иначе
    // StaggerList в next page не запускается, страница «перепрыгивает».
    window.setTimeout(() => execute(cmd), 50)
  }

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            key="palette-overlay"
            role="presentation"
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setOpen(false)}
          />
          <motion.div
            key="palette-content"
            // biome-ignore lint/a11y/useSemanticElements: native <dialog> uses top-layer + focus-trap semantics we don't want; we manage backdrop/Escape manually via AnimatePresence.
            role="dialog"
            aria-modal="true"
            aria-label="Командная палитра"
            className="fixed left-1/2 top-[15%] z-50 w-[calc(100vw-32px)] max-w-xl -translate-x-1/2"
            initial={{ opacity: 0, scale: 0.94, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: -8 }}
            transition={{ type: 'spring', stiffness: 340, damping: 28 }}
          >
            <CmdkRoot
              className="flex flex-col overflow-hidden rounded-[12px] border border-border-default bg-layer-2 shadow-2xl shadow-black/50"
              loop
            >
              <div className="flex items-center gap-2 border-b border-border-subtle px-3">
                <Search className="size-4 text-text-tertiary" aria-hidden />
                <CmdkRoot.Input
                  value={query}
                  onValueChange={setQuery}
                  placeholder="Поиск команд…"
                  className="flex-1 h-12 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none"
                />
                <kbd className="hidden md:inline-flex items-center gap-1 rounded border border-border-default bg-layer-3 px-1.5 py-0.5 font-mono text-[10px] text-text-tertiary">
                  ESC
                </kbd>
              </div>
              <CmdkRoot.List className="max-h-[400px] overflow-auto p-2">
                <CmdkRoot.Empty className="py-8 text-center text-sm text-text-tertiary">
                  Ничего не найдено
                </CmdkRoot.Empty>
                {grouped.map(([group, items]) => (
                  <CmdkRoot.Group
                    key={group}
                    heading={COMMAND_GROUP_LABELS[group]}
                    className={cn(
                      '[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5',
                      '[&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold',
                      '[&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider',
                      '[&_[cmdk-group-heading]]:text-text-tertiary',
                    )}
                  >
                    {items.map((cmd) => (
                      <CommandRow key={cmd.id} cmd={cmd} onSelect={() => handleSelect(cmd)} />
                    ))}
                  </CmdkRoot.Group>
                ))}
              </CmdkRoot.List>
            </CmdkRoot>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  )
}

function CommandRow({ cmd, onSelect }: { cmd: CommandEntry; onSelect: () => void }) {
  const Icon = cmd.icon
  const value = cmd.keywords?.length ? `${cmd.label} ${cmd.keywords.join(' ')}` : cmd.label

  return (
    <CmdkRoot.Item
      value={value}
      onSelect={onSelect}
      className={cn(
        'flex items-center gap-3 rounded-md px-2 py-2 min-h-[40px] md:min-h-0',
        'text-sm text-text-primary cursor-pointer select-none',
        'data-[selected=true]:bg-layer-3',
      )}
    >
      {Icon ? <Icon className="size-4 text-text-tertiary" strokeWidth={1.5} aria-hidden /> : null}
      <span className="flex-1 truncate">{cmd.label}</span>
      {cmd.shortcut?.length ? (
        <div className="flex gap-1">
          {cmd.shortcut.map((key) => (
            <kbd
              key={key}
              className="rounded border border-border-default bg-layer-3 px-1.5 py-0.5 font-mono text-[10px] text-text-tertiary"
            >
              {key}
            </kbd>
          ))}
        </div>
      ) : null}
    </CmdkRoot.Item>
  )
}

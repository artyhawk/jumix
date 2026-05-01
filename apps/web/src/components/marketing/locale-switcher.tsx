'use client'

import { type Locale, useLocale } from '@/lib/marketing-locale'
import { cn } from '@/lib/utils'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Check, ChevronDown, Globe } from 'lucide-react'
import { useState } from 'react'

const PREMIUM_EASE = [0.22, 1, 0.36, 1] as const

const OPTIONS: ReadonlyArray<{
  locale: Locale
  label: string
  short: string
  hint: string
}> = [
  { locale: 'ru', label: 'Русский', short: 'RU', hint: 'Русский' },
  { locale: 'kz', label: 'Қазақша', short: 'KZ', hint: 'Қазақша' },
  { locale: 'en', label: 'English', short: 'EN', hint: 'English' },
]

export function LocaleSwitcher({ className }: { className?: string }) {
  const reduceMotion = useReducedMotion()
  const { locale, setLocale } = useLocale()
  const [open, setOpen] = useState(false)
  const current = OPTIONS.find((o) => o.locale === locale) ??
    OPTIONS[0] ?? {
      locale: 'ru' as Locale,
      label: 'Русский',
      short: 'RU',
      hint: 'Русский',
    }

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={`Язык: ${current.hint}. Сменить язык`}
          className={cn(
            'inline-flex items-center gap-1.5 min-h-[44px] md:h-11 px-3 rounded-[12px]',
            'text-sm font-medium text-[var(--m-fg-secondary)]',
            'border border-transparent transition-colors duration-200',
            'hover:text-[var(--m-fg)] hover:border-[var(--m-border-strong)]',
            'data-[state=open]:text-[var(--m-fg)] data-[state=open]:border-[var(--m-border-strong)]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--m-brand)]',
            'focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--m-bg)] select-none',
            className,
          )}
        >
          <motion.span
            animate={open ? { rotate: 18 } : { rotate: 0 }}
            transition={{ duration: 0.4, ease: PREMIUM_EASE }}
            className="inline-flex"
            aria-hidden
          >
            <Globe className="size-4" />
          </motion.span>
          <span className="tabular-nums tracking-wide">{current.short}</span>
          <motion.span
            animate={open ? { rotate: 180 } : { rotate: 0 }}
            transition={{ duration: 0.32, ease: PREMIUM_EASE }}
            className="inline-flex"
            aria-hidden
          >
            <ChevronDown className="size-3 opacity-70" />
          </motion.span>
        </button>
      </DropdownMenu.Trigger>

      <AnimatePresence>
        {open ? (
          <DropdownMenu.Portal forceMount>
            <DropdownMenu.Content
              asChild
              sideOffset={8}
              align="end"
              collisionPadding={8}
              forceMount
              loop
            >
              <motion.div
                initial={reduceMotion ? false : { opacity: 0, y: -6, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.97 }}
                transition={{ duration: 0.22, ease: PREMIUM_EASE }}
                className={cn(
                  'z-50 min-w-[180px] max-w-[calc(100vw-16px)] rounded-[14px] p-1.5 origin-top-right',
                  'border border-[var(--m-border-strong)] bg-[var(--m-surface-elevated)]',
                  'shadow-[0_24px_60px_-20px_rgba(0,0,0,0.7)] backdrop-blur',
                )}
              >
                {OPTIONS.map((opt) => {
                  const isActive = opt.locale === locale
                  return (
                    <DropdownMenu.Item
                      key={opt.locale}
                      onSelect={() => setLocale(opt.locale)}
                      className={cn(
                        'group relative flex items-center gap-3 px-3 py-2.5 rounded-[10px]',
                        'text-sm cursor-pointer select-none outline-none',
                        'transition-colors duration-150',
                        'text-[var(--m-fg-secondary)] hover:text-[var(--m-fg)]',
                        'data-[highlighted]:text-[var(--m-fg)] data-[highlighted]:bg-[var(--m-surface)]',
                        isActive && 'text-[var(--m-fg)]',
                      )}
                    >
                      <span
                        aria-hidden
                        className={cn(
                          'inline-flex size-7 items-center justify-center rounded-md',
                          'text-[10px] font-semibold tabular-nums tracking-wider',
                          'border transition-colors duration-150',
                          isActive
                            ? 'border-[var(--m-brand)] bg-[color:var(--m-brand-glow)] text-[var(--m-brand)]'
                            : 'border-[var(--m-border)] text-[var(--m-fg-tertiary)] group-hover:border-[var(--m-border-strong)]',
                        )}
                      >
                        {opt.short}
                      </span>
                      <span className="flex-1">{opt.label}</span>
                      {isActive ? (
                        <Check className="size-4 text-[var(--m-brand)]" aria-hidden />
                      ) : null}
                    </DropdownMenu.Item>
                  )
                })}
              </motion.div>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        ) : null}
      </AnimatePresence>
    </DropdownMenu.Root>
  )
}

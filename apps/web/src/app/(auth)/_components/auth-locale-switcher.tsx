'use client'

import { type Locale, useLocale } from '@/lib/marketing-locale'
import { cn } from '@/lib/utils'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Check, ChevronDown, Globe } from 'lucide-react'
import { useState } from 'react'

const OPTIONS = [
  { locale: 'ru', label: 'Русский', short: 'RU' },
  { locale: 'kz', label: 'Қазақша', short: 'KZ' },
  { locale: 'en', label: 'English', short: 'EN' },
] as const satisfies ReadonlyArray<{
  locale: Locale
  label: string
  short: string
}>

/**
 * Locale switcher для auth-страниц (admin-стилизация: admin tokens вместо
 * marketing `--m-*`). Использует тот же `useLocale()` из MarketingLocaleProvider.
 */
export function AuthLocaleSwitcher({ className }: { className?: string }) {
  const { locale, setLocale } = useLocale()
  const [open, setOpen] = useState(false)
  const current = OPTIONS.find((o) => o.locale === locale) ?? OPTIONS[0]

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={`Language: ${current.label}`}
          className={cn(
            'inline-flex items-center gap-1.5 h-9 px-3 rounded-md',
            'text-sm font-medium text-text-secondary',
            'border border-transparent transition-colors duration-200',
            'hover:text-text-primary hover:border-border-subtle hover:bg-layer-1',
            'data-[state=open]:text-text-primary data-[state=open]:border-border-subtle data-[state=open]:bg-layer-1',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-layer-0',
            className,
          )}
        >
          <Globe className="size-4" aria-hidden />
          <span className="tabular-nums tracking-wide">{current.short}</span>
          <ChevronDown
            className={cn('size-3 opacity-70 transition-transform', open && 'rotate-180')}
            aria-hidden
          />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          sideOffset={6}
          align="end"
          collisionPadding={8}
          className={cn(
            'z-50 min-w-[160px] rounded-md p-1',
            'border border-border-subtle bg-layer-1',
            'shadow-lg shadow-black/30',
          )}
        >
          {OPTIONS.map((opt) => {
            const isActive = opt.locale === locale
            return (
              <DropdownMenu.Item
                key={opt.locale}
                onSelect={() => setLocale(opt.locale)}
                className={cn(
                  'flex items-center gap-2 px-2.5 py-2 rounded-sm',
                  'text-sm cursor-pointer select-none outline-none',
                  'text-text-secondary hover:text-text-primary',
                  'data-[highlighted]:text-text-primary data-[highlighted]:bg-layer-2',
                  isActive && 'text-text-primary',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'inline-flex size-6 items-center justify-center rounded',
                    'text-[10px] font-semibold tabular-nums',
                    isActive ? 'bg-brand-500/15 text-brand-500' : 'bg-layer-2 text-text-tertiary',
                  )}
                >
                  {opt.short}
                </span>
                <span className="flex-1">{opt.label}</span>
                {isActive ? <Check className="size-4 text-brand-500" aria-hidden /> : null}
              </DropdownMenu.Item>
            )
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}

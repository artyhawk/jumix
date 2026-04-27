'use client'

import { useT } from '@/lib/marketing-locale'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'
import { whatsappLink } from './whatsapp'

type Variant = 'primary' | 'ghost' | 'outline'
type Size = 'md' | 'lg'

const base =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[12px] font-medium ' +
  'transition-colors duration-200 select-none ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--m-brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--m-bg)]'

const variants: Record<Variant, string> = {
  primary: 'bg-[var(--m-brand)] text-[#0a0a0b] hover:bg-[var(--m-brand-hover)] m-cta-glow',
  ghost: 'text-[var(--m-fg)] hover:text-[var(--m-brand)]',
  outline:
    'border border-[var(--m-border-strong)] text-[var(--m-fg)] hover:border-[var(--m-brand)] hover:text-[var(--m-brand)]',
}

const sizes: Record<Size, string> = {
  md: 'min-h-[44px] md:h-11 px-5 text-sm',
  lg: 'min-h-[52px] md:h-14 px-7 text-[15px]',
}

export function WhatsAppButton({
  variant = 'primary',
  size = 'md',
  message,
  children,
  className,
  showIcon = true,
}: {
  variant?: Variant
  size?: Size
  message?: string
  children?: ReactNode
  className?: string
  showIcon?: boolean
}) {
  const t = useT()
  const resolvedMessage = message ?? t('marketing.whatsappMessage')
  return (
    <a
      href={whatsappLink(resolvedMessage)}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(base, variants[variant], sizes[size], className)}
      data-testid="whatsapp-button"
    >
      {showIcon ? <WhatsAppIcon className="size-[18px]" /> : null}
      <span>{children ?? t('marketing.hero.ctaPrimary')}</span>
    </a>
  )
}

export function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      role="img"
      aria-label="WhatsApp"
    >
      <title>WhatsApp</title>
      <path d="M19.05 4.91A9.82 9.82 0 0 0 12.07 2C6.58 2 2.13 6.45 2.13 11.94c0 1.76.46 3.45 1.32 4.95L2 22l5.27-1.38a9.93 9.93 0 0 0 4.79 1.22h.01c5.49 0 9.94-4.45 9.94-9.94 0-2.65-1.03-5.15-2.96-7.04Zm-7 15.13h-.01a8.26 8.26 0 0 1-4.21-1.15l-.3-.18-3.13.82.83-3.05-.2-.31a8.24 8.24 0 0 1-1.27-4.4c0-4.55 3.7-8.25 8.27-8.25a8.2 8.2 0 0 1 5.84 2.42 8.21 8.21 0 0 1 2.42 5.84c.02 4.56-3.69 8.26-8.24 8.26Zm4.53-6.18c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.16.25-.64.81-.79.97-.14.16-.29.18-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.24-1.47-1.39-1.72-.14-.25-.02-.39.11-.51.11-.11.25-.29.37-.43.12-.14.16-.25.25-.41.08-.16.04-.31-.02-.43-.06-.12-.56-1.34-.77-1.84-.2-.49-.41-.42-.56-.43h-.48c-.16 0-.43.06-.66.31-.23.25-.86.84-.86 2.06s.88 2.39 1 2.55c.12.16 1.74 2.66 4.21 3.73.59.25 1.05.41 1.41.52.59.19 1.13.16 1.55.1.47-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.11-.22-.18-.46-.3Z" />
    </svg>
  )
}

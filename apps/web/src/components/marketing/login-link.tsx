'use client'

import { useT } from '@/lib/marketing-locale'
import { cn } from '@/lib/utils'
import Link from 'next/link'

type Variant = 'ghost' | 'outline' | 'primary'
type Size = 'md' | 'lg'

const base =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[12px] font-medium ' +
  'transition-colors duration-200 select-none ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--m-brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--m-bg)]'

const variants: Record<Variant, string> = {
  ghost: 'text-[var(--m-fg)] hover:text-[var(--m-brand)]',
  outline:
    'border border-[var(--m-border-strong)] text-[var(--m-fg)] hover:border-[var(--m-brand)] hover:text-[var(--m-brand)]',
  primary: 'bg-[var(--m-brand)] text-[#0a0a0b] hover:bg-[var(--m-brand-hover)]',
}

const sizes: Record<Size, string> = {
  md: 'min-h-[44px] md:h-11 px-5 text-sm',
  lg: 'min-h-[52px] md:h-14 px-7 text-[15px]',
}

export function LoginLink({
  variant = 'outline',
  size = 'md',
  label,
  className,
}: {
  variant?: Variant
  size?: Size
  label?: string
  className?: string
}) {
  const t = useT()
  return (
    <Link
      href="/login"
      prefetch={false}
      className={cn(base, variants[variant], sizes[size], className)}
      data-testid="login-link"
    >
      {label ?? t('marketing.nav.login')}
    </Link>
  )
}

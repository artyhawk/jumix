import { cn } from '@/lib/utils'
import { AlertTriangle } from 'lucide-react'

export type BadgeVariant =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'active'
  | 'inactive'
  | 'blocked'
  | 'terminated'
  | 'expired'
  | 'expiring'
  | 'neutral'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
  withDot?: boolean
}

/**
 * Status badge по дизайн-системе §8.5 — dot + text, 22px высотой.
 * Warning-состояния (expiring/expired) ВСЕГДА с иконкой чтобы не путать с brand-оранжевым.
 */
const variantStyles: Record<
  BadgeVariant,
  { text: string; bg: string; border: string; dot: string }
> = {
  pending: {
    text: 'text-warning',
    bg: 'bg-warning/10',
    border: 'border-warning/25',
    dot: 'bg-warning',
  },
  approved: {
    text: 'text-success',
    bg: 'bg-success/10',
    border: 'border-success/25',
    dot: 'bg-success',
  },
  rejected: {
    text: 'text-danger',
    bg: 'bg-danger/10',
    border: 'border-danger/25',
    dot: 'bg-danger',
  },
  active: {
    text: 'text-success',
    bg: 'bg-success/10',
    border: 'border-success/25',
    dot: 'bg-success',
  },
  inactive: {
    text: 'text-text-tertiary',
    bg: 'bg-text-tertiary/10',
    border: 'border-text-tertiary/25',
    dot: 'bg-text-tertiary',
  },
  blocked: {
    text: 'text-danger',
    bg: 'bg-danger/10',
    border: 'border-danger/25',
    dot: 'bg-danger',
  },
  terminated: {
    text: 'text-text-tertiary',
    bg: 'bg-text-tertiary/10',
    border: 'border-text-tertiary/25',
    dot: 'bg-text-tertiary',
  },
  expired: {
    text: 'text-danger',
    bg: 'bg-danger/10',
    border: 'border-danger/25',
    dot: 'bg-danger',
  },
  expiring: {
    text: 'text-warning',
    bg: 'bg-warning/10',
    border: 'border-warning/25',
    dot: 'bg-warning',
  },
  neutral: {
    text: 'text-text-secondary',
    bg: 'bg-layer-3',
    border: 'border-border-default',
    dot: 'bg-text-tertiary',
  },
}

export function Badge({
  variant = 'neutral',
  withDot = true,
  className,
  children,
  ...props
}: BadgeProps) {
  const styles = variantStyles[variant]
  const showWarningIcon = variant === 'expiring' || variant === 'expired'

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 h-[22px] px-2 rounded-md border text-[12px] font-medium',
        styles.text,
        styles.bg,
        styles.border,
        className,
      )}
      {...props}
    >
      {showWarningIcon ? (
        <AlertTriangle aria-hidden className="size-3" strokeWidth={2} />
      ) : withDot ? (
        <span aria-hidden className={cn('size-[6px] rounded-full', styles.dot)} />
      ) : null}
      {children}
    </span>
  )
}

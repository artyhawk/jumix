'use client'

import { Button } from '@/components/ui/button'
import { requestSmsCode, verifySmsCode } from '@/lib/api/auth'
import { AppError } from '@/lib/api/errors'
import { useAuthStore } from '@/lib/auth-store'
import { t } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

const RESEND_SECONDS = 60
const OTP_SLOTS = ['s0', 's1', 's2', 's3', 's4', 's5'] as const

export function OtpForm({ phone }: { phone: string }) {
  const router = useRouter()
  const setSession = useAuthStore((s) => s.setSession)
  const [digits, setDigits] = useState<string[]>(['', '', '', '', '', ''])
  const [error, setError] = useState<string | null>(null)
  const [shakeId, setShakeId] = useState(0)
  const [loading, setLoading] = useState(false)
  const [resendIn, setResendIn] = useState(RESEND_SECONDS)
  const [resendLoading, setResendLoading] = useState(false)
  const inputsRef = useRef<Array<HTMLInputElement | null>>([])

  // Countdown
  useEffect(() => {
    if (resendIn <= 0) return
    const id = setTimeout(() => setResendIn((v) => v - 1), 1000)
    return () => clearTimeout(id)
  }, [resendIn])

  // Autofocus первого поля при mount
  useEffect(() => {
    inputsRef.current[0]?.focus()
  }, [])

  const triggerShake = (msg: string) => {
    setError(msg)
    setShakeId((n) => n + 1)
    setDigits(['', '', '', '', '', ''])
    inputsRef.current[0]?.focus()
  }

  const submit = async (code: string) => {
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      const res = await verifySmsCode({ phone, code, clientKind: 'web' })
      setSession(res)
      router.push('/')
    } catch (err) {
      if (err instanceof AppError) {
        triggerShake(mapError(err))
      } else {
        triggerShake(t('auth.verify.genericError'))
      }
    } finally {
      setLoading(false)
    }
  }

  const setDigitAt = (idx: number, value: string) => {
    if (value.length > 1) {
      // paste multiple digits — распределим по всем боксам
      const chars = value.replace(/\D/g, '').slice(0, 6).split('')
      const next = ['', '', '', '', '', '']
      chars.forEach((c, i) => {
        next[i] = c
      })
      setDigits(next)
      const target = Math.min(chars.length, 5)
      inputsRef.current[target]?.focus()
      if (chars.length === 6) void submit(chars.join(''))
      return
    }

    const next = [...digits]
    next[idx] = value.replace(/\D/g, '').slice(0, 1)
    setDigits(next)

    if (next[idx] && idx < 5) {
      inputsRef.current[idx + 1]?.focus()
    }

    if (next.every((d) => d.length === 1) && next.join('').length === 6) {
      void submit(next.join(''))
    }
  }

  const onKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      inputsRef.current[idx - 1]?.focus()
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      inputsRef.current[idx - 1]?.focus()
    } else if (e.key === 'ArrowRight' && idx < 5) {
      inputsRef.current[idx + 1]?.focus()
    }
  }

  const onResend = async () => {
    if (resendIn > 0 || resendLoading) return
    setResendLoading(true)
    setError(null)
    try {
      await requestSmsCode(phone)
      setResendIn(RESEND_SECONDS)
    } catch (err) {
      if (err instanceof AppError) {
        setError(mapError(err))
      } else {
        setError(t('auth.verify.genericError'))
      }
    } finally {
      setResendLoading(false)
    }
  }

  const maskedPhone = maskForDisplay(phone)

  return (
    <div className="flex flex-col gap-5">
      <div className="text-sm text-text-secondary">
        {t('auth.verify.subtitle')}{' '}
        <span className="text-text-primary font-mono-numbers">{maskedPhone}</span>
      </div>

      <motion.div
        key={shakeId}
        initial={false}
        animate={shakeId > 0 ? { x: [0, -4, 4, -4, 4, 0] } : { x: 0 }}
        transition={{ duration: 0.4 }}
        className="flex items-center justify-between gap-1.5 md:gap-2"
        aria-label={t('auth.verify.codeLabel')}
      >
        {OTP_SLOTS.map((slot, i) => (
          <input
            key={slot}
            ref={(el) => {
              inputsRef.current[i] = el
            }}
            type="text"
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            maxLength={i === 0 ? 6 : 1}
            value={digits[i] ?? ''}
            onChange={(e) => setDigitAt(i, e.target.value)}
            onKeyDown={(e) => onKeyDown(i, e)}
            onFocus={(e) => e.currentTarget.select()}
            disabled={loading}
            aria-label={`Цифра ${i + 1}`}
            className={cn(
              'flex-1 min-w-0 h-14 md:h-12 text-center',
              'bg-layer-1 border rounded-[10px]',
              'text-xl md:text-lg font-mono-numbers text-text-primary',
              'transition-colors duration-150',
              'focus:outline-none',
              error
                ? 'border-danger focus:border-danger focus:ring-2 focus:ring-danger/40'
                : 'border-border-default focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30',
            )}
          />
        ))}
      </motion.div>

      {error ? (
        <div
          role="alert"
          className="text-sm text-danger bg-danger/10 border border-danger/25 rounded-md px-3 py-2"
        >
          {error}
        </div>
      ) : null}

      <div className="flex items-center justify-between text-sm">
        <button
          type="button"
          onClick={() => router.push('/login')}
          className="text-text-secondary hover:text-text-primary transition-colors"
        >
          ← {t('auth.verify.changePhone')}
        </button>
        <button
          type="button"
          onClick={onResend}
          disabled={resendIn > 0 || resendLoading}
          className={cn(
            'font-medium transition-colors',
            resendIn > 0
              ? 'text-text-tertiary cursor-not-allowed'
              : 'text-brand-500 hover:text-brand-400',
          )}
        >
          {resendIn > 0 ? (
            <>
              {t('auth.verify.resendIn')} {formatTime(resendIn)}
            </>
          ) : (
            t('auth.verify.resend')
          )}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center text-xs text-text-tertiary">
          <Button loading variant="ghost" size="sm" aria-label="Проверка кода…">
            {' '}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function maskForDisplay(e164: string): string {
  if (!/^\+7\d{10}$/.test(e164)) return e164
  return `+7 ${e164.slice(2, 5)} ••• •• ${e164.slice(10, 12)}`
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function mapError(err: AppError): string {
  switch (err.code) {
    case 'INVALID_CODE':
      return t('auth.verify.invalidCode')
    case 'CODE_EXPIRED':
      return t('auth.verify.expiredCode')
    case 'MAX_ATTEMPTS_EXCEEDED':
      return t('auth.verify.maxAttempts')
    case 'USER_NOT_REGISTERED':
      return t('auth.verify.userNotRegistered')
    case 'SMS_RATE_LIMITED':
    case 'RATE_LIMITED':
      return t('auth.login.rateLimited')
    default:
      return err.message || t('auth.verify.genericError')
  }
}

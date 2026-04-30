'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { confirmPasswordReset, requestPasswordReset } from '@/lib/api/auth'
import { AppError } from '@/lib/api/errors'
import { t } from '@/lib/i18n'
import { applyPhoneMask, toE164 } from '@/lib/phone-format'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { ArrowRight, CheckCircle2, KeyRound, Lock, Phone } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

type Step = 'phone' | 'reset' | 'success'

const RESEND_SECONDS = 60
const OTP_SLOTS = ['s0', 's1', 's2', 's3', 's4', 's5'] as const
/** Должно совпадать с `MIN_PASSWORD_LENGTH` из `@jumix/auth/password/hash.ts`. */
const MIN_PASSWORD_LENGTH = 10

export function ForgotPasswordForm() {
  const [step, setStep] = useState<Step>('phone')

  // Phone step
  const [phoneDisplay, setPhoneDisplay] = useState('')
  const [phoneDigits, setPhoneDigits] = useState('')

  // Reset step
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', ''])
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [resendIn, setResendIn] = useState(0)
  const [resendLoading, setResendLoading] = useState(false)
  const otpInputsRef = useRef<Array<HTMLInputElement | null>>([])

  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(0)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (step !== 'reset') return
    if (resendIn <= 0) return
    const id = setTimeout(() => setResendIn((v) => v - 1), 1000)
    return () => clearTimeout(id)
  }, [step, resendIn])

  useEffect(() => {
    if (step === 'reset') {
      otpInputsRef.current[0]?.focus()
    }
  }, [step])

  const triggerShake = (msg: string) => {
    setError(msg)
    setShake((n) => n + 1)
  }

  const onPhoneChange = (v: string) => {
    const { formatted, digits } = applyPhoneMask(v)
    setPhoneDisplay(formatted)
    setPhoneDigits(digits)
    if (error) setError(null)
  }

  const onSubmitPhone = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    const e164 = toE164(phoneDigits)
    if (!e164) {
      triggerShake(t('auth.forgotPassword.invalidPhone'))
      return
    }
    setLoading(true)
    setError(null)
    try {
      await requestPasswordReset(e164)
      setStep('reset')
      setOtpDigits(['', '', '', '', '', ''])
      setNewPassword('')
      setConfirmPassword('')
      setResendIn(RESEND_SECONDS)
    } catch (err) {
      if (err instanceof AppError) {
        triggerShake(mapRequestError(err))
      } else {
        triggerShake(t('auth.forgotPassword.genericError'))
      }
    } finally {
      setLoading(false)
    }
  }

  const setOtpAt = (idx: number, value: string) => {
    if (value.length > 1) {
      const chars = value.replace(/\D/g, '').slice(0, 6).split('')
      const next = ['', '', '', '', '', '']
      chars.forEach((c, i) => {
        next[i] = c
      })
      setOtpDigits(next)
      const target = Math.min(chars.length, 5)
      otpInputsRef.current[target]?.focus()
      return
    }
    const next = [...otpDigits]
    next[idx] = value.replace(/\D/g, '').slice(0, 1)
    setOtpDigits(next)
    if (next[idx] && idx < 5) {
      otpInputsRef.current[idx + 1]?.focus()
    }
  }

  const onOtpKeyDown = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otpDigits[idx] && idx > 0) {
      otpInputsRef.current[idx - 1]?.focus()
    } else if (e.key === 'ArrowLeft' && idx > 0) {
      otpInputsRef.current[idx - 1]?.focus()
    } else if (e.key === 'ArrowRight' && idx < 5) {
      otpInputsRef.current[idx + 1]?.focus()
    }
  }

  const onSubmitReset = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    const code = otpDigits.join('')
    if (code.length !== 6) {
      triggerShake(t('auth.forgotPassword.invalidCode'))
      return
    }
    if (newPassword.length < MIN_PASSWORD_LENGTH) {
      triggerShake(t('auth.forgotPassword.passwordTooShort'))
      return
    }
    if (newPassword !== confirmPassword) {
      triggerShake(t('auth.forgotPassword.passwordsDoNotMatch'))
      return
    }
    const e164 = toE164(phoneDigits)
    if (!e164) {
      triggerShake(t('auth.forgotPassword.invalidPhone'))
      setStep('phone')
      return
    }

    setLoading(true)
    setError(null)
    try {
      await confirmPasswordReset({ phone: e164, code, newPassword })
      setStep('success')
    } catch (err) {
      if (err instanceof AppError) {
        triggerShake(mapConfirmError(err))
        // Очищаем код, чтобы пользователь ввёл свежий
        setOtpDigits(['', '', '', '', '', ''])
        otpInputsRef.current[0]?.focus()
      } else {
        triggerShake(t('auth.forgotPassword.genericError'))
      }
    } finally {
      setLoading(false)
    }
  }

  const onResend = async () => {
    if (resendIn > 0 || resendLoading) return
    const e164 = toE164(phoneDigits)
    if (!e164) return
    setResendLoading(true)
    setError(null)
    try {
      await requestPasswordReset(e164)
      setResendIn(RESEND_SECONDS)
    } catch (err) {
      if (err instanceof AppError) {
        setError(mapRequestError(err))
      } else {
        setError(t('auth.forgotPassword.genericError'))
      }
    } finally {
      setResendLoading(false)
    }
  }

  if (step === 'success') {
    return (
      <div className="flex flex-col items-center gap-5 text-center">
        <div className="size-12 rounded-full bg-success/15 flex items-center justify-center">
          <CheckCircle2 className="size-6 text-success" aria-hidden />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold text-text-primary">
            {t('auth.forgotPassword.successTitle')}
          </h2>
          <p className="text-sm text-text-secondary">{t('auth.forgotPassword.successSubtitle')}</p>
        </div>
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 px-4 h-10 rounded-md bg-brand-500 hover:bg-brand-400 text-brand-foreground font-medium transition-colors"
        >
          {t('auth.forgotPassword.goToLogin')}
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    )
  }

  if (step === 'reset') {
    const masked = maskPhoneForDisplay(toE164(phoneDigits) ?? phoneDigits)
    return (
      <motion.form
        key={shake}
        onSubmit={onSubmitReset}
        className="flex flex-col gap-4"
        initial={false}
        animate={shake > 0 ? { x: [0, -4, 4, -4, 4, 0] } : { x: 0 }}
        transition={{ duration: 0.4 }}
        noValidate
      >
        <div className="text-sm text-text-secondary">
          {t('auth.forgotPassword.resetSubtitle')}{' '}
          <span className="text-text-primary font-mono-numbers">{masked}</span>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-text-secondary">
            {t('auth.forgotPassword.codeLabel')}
          </span>
          <div className="flex items-center justify-between gap-1.5 md:gap-2">
            {OTP_SLOTS.map((slot, i) => (
              <input
                key={slot}
                ref={(el) => {
                  otpInputsRef.current[i] = el
                }}
                type="text"
                inputMode="numeric"
                autoComplete={i === 0 ? 'one-time-code' : 'off'}
                maxLength={i === 0 ? 6 : 1}
                value={otpDigits[i] ?? ''}
                onChange={(e) => setOtpAt(i, e.target.value)}
                onKeyDown={(e) => onOtpKeyDown(i, e)}
                onFocus={(e) => e.currentTarget.select()}
                disabled={loading}
                aria-label={`Цифра ${i + 1}`}
                className={cn(
                  'flex-1 min-w-0 h-12 text-center',
                  'bg-layer-1 border rounded-[10px]',
                  'text-lg font-mono-numbers text-text-primary',
                  'transition-colors duration-150 focus:outline-none',
                  error
                    ? 'border-danger focus:border-danger focus:ring-2 focus:ring-danger/40'
                    : 'border-border-default focus:border-brand-500 focus:ring-2 focus:ring-brand-500/30',
                )}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="newPassword" className="text-xs font-medium text-text-secondary">
            {t('auth.forgotPassword.newPasswordLabel')}
          </label>
          <div className="relative">
            <Lock
              className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-text-tertiary pointer-events-none"
              aria-hidden
            />
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              placeholder={t('auth.forgotPassword.newPasswordPlaceholder')}
              value={newPassword}
              onChange={(e) => {
                setNewPassword(e.target.value)
                if (error) setError(null)
              }}
              className="pl-9"
              minLength={MIN_PASSWORD_LENGTH}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="confirmPassword" className="text-xs font-medium text-text-secondary">
            {t('auth.forgotPassword.confirmPasswordLabel')}
          </label>
          <div className="relative">
            <KeyRound
              className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-text-tertiary pointer-events-none"
              aria-hidden
            />
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              placeholder={t('auth.forgotPassword.confirmPasswordPlaceholder')}
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value)
                if (error) setError(null)
              }}
              className="pl-9"
            />
          </div>
        </div>

        {error ? (
          <div
            role="alert"
            className="text-sm text-danger bg-danger/10 border border-danger/25 rounded-md px-3 py-2"
          >
            {error}
          </div>
        ) : null}

        <Button type="submit" variant="primary" size="lg" block loading={loading}>
          {t('auth.forgotPassword.submitReset')}
          {!loading && <ArrowRight className="size-4" aria-hidden />}
        </Button>

        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            onClick={() => {
              setStep('phone')
              setError(null)
              setOtpDigits(['', '', '', '', '', ''])
              setNewPassword('')
              setConfirmPassword('')
            }}
            className="text-text-secondary hover:text-text-primary transition-colors"
          >
            ← {t('auth.forgotPassword.edit')}
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
      </motion.form>
    )
  }

  return (
    <motion.form
      key={shake}
      onSubmit={onSubmitPhone}
      className="flex flex-col gap-4"
      initial={false}
      animate={shake > 0 ? { x: [0, -4, 4, -4, 4, 0] } : { x: 0 }}
      transition={{ duration: 0.4 }}
      noValidate
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="phone" className="text-xs font-medium text-text-secondary">
          {t('auth.forgotPassword.phoneLabel')}
        </label>
        <div className="relative">
          <Phone
            className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-text-tertiary pointer-events-none"
            aria-hidden
          />
          <Input
            id="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder={t('auth.forgotPassword.phonePlaceholder')}
            value={phoneDisplay}
            onChange={(e) => onPhoneChange(e.target.value)}
            className="pl-9"
            invalid={Boolean(error)}
          />
        </div>
      </div>

      {error ? (
        <div
          role="alert"
          className="text-sm text-danger bg-danger/10 border border-danger/25 rounded-md px-3 py-2"
        >
          {error}
        </div>
      ) : null}

      <Button
        type="submit"
        variant="primary"
        size="lg"
        block
        loading={loading}
        disabled={phoneDigits.length !== 10}
      >
        {t('auth.forgotPassword.submitPhone')}
        {!loading && <ArrowRight className="size-4" aria-hidden />}
      </Button>

      <div className="text-sm text-center text-text-secondary">
        {t('auth.forgotPassword.rememberPassword')}{' '}
        <Link href="/login" className="text-brand-500 hover:text-brand-400 font-medium">
          {t('auth.forgotPassword.loginLink')}
        </Link>
      </div>
    </motion.form>
  )
}

function maskPhoneForDisplay(e164: string): string {
  if (!/^\+7\d{10}$/.test(e164)) return e164
  return `+7 ${e164.slice(2, 5)} ••• •• ${e164.slice(10, 12)}`
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

function mapRequestError(err: AppError): string {
  switch (err.code) {
    case 'RATE_LIMITED':
    case 'SMS_RATE_LIMITED':
      return t('auth.forgotPassword.rateLimited')
    case 'SMS_DELIVERY_FAILED':
      return t('auth.forgotPassword.smsDeliveryFailed')
    default:
      return err.message || t('auth.forgotPassword.genericError')
  }
}

function mapConfirmError(err: AppError): string {
  switch (err.code) {
    case 'PASSWORD_RESET_INVALID':
    case 'SMS_CODE_INVALID_OR_EXPIRED':
      return t('auth.forgotPassword.invalidCode')
    case 'RATE_LIMITED':
      return t('auth.forgotPassword.rateLimited')
    default:
      return err.message || t('auth.forgotPassword.genericError')
  }
}

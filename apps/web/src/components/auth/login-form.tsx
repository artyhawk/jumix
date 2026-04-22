'use client'

import { FadeSwap } from '@/components/motion/fade-swap'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { passwordLogin, requestSmsCode } from '@/lib/api/auth'
import { AppError } from '@/lib/api/errors'
import { useAuthStore } from '@/lib/auth-store'
import { t } from '@/lib/i18n'
import { applyPhoneMask, toE164 } from '@/lib/phone-format'
import { motion } from 'framer-motion'
import { ArrowRight, Lock, Phone } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Mode = 'sms' | 'password'

export function LoginForm() {
  const router = useRouter()
  const setSession = useAuthStore((s) => s.setSession)
  const [mode, setMode] = useState<Mode>('sms')
  const [phoneDisplay, setPhoneDisplay] = useState('')
  const [phoneDigits, setPhoneDigits] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [shake, setShake] = useState(0)
  const [loading, setLoading] = useState(false)

  const phoneValid = phoneDigits.length === 10
  const canSubmit = mode === 'sms' ? phoneValid : phoneValid && password.length >= 1

  const onPhoneChange = (v: string) => {
    const { formatted, digits } = applyPhoneMask(v)
    setPhoneDisplay(formatted)
    setPhoneDigits(digits)
    if (error) setError(null)
  }

  const triggerShake = (msg: string) => {
    setError(msg)
    setShake((n) => n + 1)
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit || loading) return

    const e164 = toE164(phoneDigits)
    if (!e164) {
      triggerShake(t('auth.login.invalidPhone'))
      return
    }

    setLoading(true)
    setError(null)

    try {
      if (mode === 'sms') {
        await requestSmsCode(e164)
        router.push(`/login/verify?phone=${encodeURIComponent(e164)}`)
      } else {
        const res = await passwordLogin({ phone: e164, password, clientKind: 'web' })
        setSession(res)
        router.push('/')
      }
    } catch (err) {
      if (err instanceof AppError) {
        triggerShake(mapError(err))
      } else {
        triggerShake(t('auth.login.genericError'))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.form
      key={shake}
      onSubmit={onSubmit}
      className="flex flex-col gap-4"
      initial={false}
      animate={shake > 0 ? { x: [0, -4, 4, -4, 4, 0] } : { x: 0 }}
      transition={{ duration: 0.4 }}
      noValidate
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="phone" className="text-xs font-medium text-text-secondary">
          {t('auth.login.phoneLabel')}
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
            placeholder={t('auth.login.phonePlaceholder')}
            value={phoneDisplay}
            onChange={(e) => onPhoneChange(e.target.value)}
            className="pl-9"
            invalid={Boolean(error) && !phoneValid}
          />
        </div>
      </div>

      <FadeSwap swapKey={mode}>
        {mode === 'password' ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-xs font-medium text-text-secondary">
              {t('auth.login.passwordLabel')}
            </label>
            <div className="relative">
              <Lock
                className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-text-tertiary pointer-events-none"
                aria-hidden
              />
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder={t('auth.login.passwordPlaceholder')}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (error) setError(null)
                }}
                className="pl-9"
                invalid={Boolean(error) && password.length === 0}
              />
            </div>
          </div>
        ) : (
          <span className="hidden" aria-hidden />
        )}
      </FadeSwap>

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
        disabled={!canSubmit}
      >
        {mode === 'sms' ? t('auth.login.continue') : t('auth.login.loginButton')}
        {!loading && <ArrowRight className="size-4" aria-hidden />}
      </Button>

      <div className="relative my-2">
        <div className="absolute inset-x-0 top-1/2 h-px bg-border-subtle" />
        <span className="relative mx-auto inline-block bg-layer-1 px-3 text-[11px] uppercase tracking-wider text-text-tertiary">
          {t('auth.login.or')}
        </span>
      </div>

      <button
        type="button"
        onClick={() => {
          setMode(mode === 'sms' ? 'password' : 'sms')
          setError(null)
          setPassword('')
        }}
        className="text-sm text-brand-500 hover:text-brand-400 transition-colors font-medium text-center"
      >
        {mode === 'sms' ? t('auth.login.usePassword') : t('auth.login.useSms')}
      </button>
    </motion.form>
  )
}

function mapError(err: AppError): string {
  switch (err.code) {
    case 'INVALID_CREDENTIALS':
      return t('auth.login.invalidCredentials')
    case 'SMS_RATE_LIMITED':
    case 'RATE_LIMITED':
      return t('auth.login.rateLimited')
    case 'ACCOUNT_LOCKED':
      return t('auth.login.accountLocked')
    default:
      return err.message || t('auth.login.genericError')
  }
}

'use client'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { startRegistration, verifyRegistration } from '@/lib/api/auth'
import { AppError } from '@/lib/api/errors'
import { useAuthStore } from '@/lib/auth-store'
import { t } from '@/lib/i18n'
import { applyPhoneMask, toE164 } from '@/lib/phone-format'
import { cn } from '@/lib/utils'
import { isValidKzIin } from '@jumix/shared'
import { motion } from 'framer-motion'
import { ArrowRight, CreditCard, Phone, User, UserCircle2 } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

type Step = 'profile' | 'otp'
type FieldError = 'lastName' | 'firstName' | 'iin' | 'phone'

const RESEND_SECONDS = 60
const OTP_SLOTS = ['s0', 's1', 's2', 's3', 's4', 's5'] as const

interface ProfileData {
  lastName: string
  firstName: string
  patronymic: string
  iin: string
  /** E.164 — `+7XXXXXXXXXX`. */
  phoneE164: string
}

export function RegisterForm() {
  const router = useRouter()
  const setSession = useAuthStore((s) => s.setSession)

  const [step, setStep] = useState<Step>('profile')

  // Profile fields
  const [lastName, setLastName] = useState('')
  const [firstName, setFirstName] = useState('')
  const [patronymic, setPatronymic] = useState('')
  const [iin, setIin] = useState('')
  const [phoneDisplay, setPhoneDisplay] = useState('')
  const [phoneDigits, setPhoneDigits] = useState('')

  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Set<FieldError>>(() => new Set())
  const [shake, setShake] = useState(0)
  const [loading, setLoading] = useState(false)

  // OTP step state
  const [otpDigits, setOtpDigits] = useState<string[]>(['', '', '', '', '', ''])
  const [resendIn, setResendIn] = useState(0)
  const [resendLoading, setResendLoading] = useState(false)
  const otpInputsRef = useRef<Array<HTMLInputElement | null>>([])

  useEffect(() => {
    if (step !== 'otp') return
    if (resendIn <= 0) return
    const id = setTimeout(() => setResendIn((v) => v - 1), 1000)
    return () => clearTimeout(id)
  }, [step, resendIn])

  useEffect(() => {
    if (step === 'otp') {
      otpInputsRef.current[0]?.focus()
    }
  }, [step])

  const onPhoneChange = (v: string) => {
    const { formatted, digits } = applyPhoneMask(v)
    setPhoneDisplay(formatted)
    setPhoneDigits(digits)
    if (error) setError(null)
    if (fieldErrors.has('phone')) clearFieldError('phone')
  }

  const onIinChange = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, 12)
    setIin(digits)
    if (error) setError(null)
    if (fieldErrors.has('iin')) clearFieldError('iin')
  }

  const clearFieldError = (f: FieldError) => {
    setFieldErrors((prev) => {
      if (!prev.has(f)) return prev
      const next = new Set(prev)
      next.delete(f)
      return next
    })
  }

  const triggerShake = (msg: string, fields?: FieldError[]) => {
    setError(msg)
    setShake((n) => n + 1)
    if (fields && fields.length > 0) {
      setFieldErrors(new Set(fields))
    }
  }

  const validateProfile = (): { ok: true; e164: string; profile: ProfileData } | { ok: false } => {
    const fields: FieldError[] = []
    if (lastName.trim().length === 0) fields.push('lastName')
    if (firstName.trim().length === 0) fields.push('firstName')
    if (iin.length !== 12 || !isValidKzIin(iin)) fields.push('iin')

    const e164 = toE164(phoneDigits)
    if (!e164) fields.push('phone')

    if (fields.length > 0) {
      // Pick first failing field to show as message
      const first = fields[0]
      const msg =
        first === 'lastName'
          ? t('auth.register.invalidLastName')
          : first === 'firstName'
            ? t('auth.register.invalidFirstName')
            : first === 'iin'
              ? t('auth.register.invalidIin')
              : t('auth.register.invalidPhone')
      triggerShake(msg, fields)
      return { ok: false }
    }

    return {
      ok: true,
      e164: e164 ?? '',
      profile: {
        lastName: lastName.trim(),
        firstName: firstName.trim(),
        patronymic: patronymic.trim(),
        iin,
        phoneE164: e164 ?? '',
      },
    }
  }

  const onSubmitProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return

    const result = validateProfile()
    if (!result.ok) return

    setLoading(true)
    setError(null)
    try {
      await startRegistration(result.e164)
      setStep('otp')
      setOtpDigits(['', '', '', '', '', ''])
      setResendIn(RESEND_SECONDS)
    } catch (err) {
      if (err instanceof AppError) {
        triggerShake(mapStartError(err))
      } else {
        triggerShake(t('auth.register.genericError'))
      }
    } finally {
      setLoading(false)
    }
  }

  const submitOtp = async (code: string) => {
    if (loading) return
    setLoading(true)
    setError(null)
    try {
      const e164 = toE164(phoneDigits)
      if (!e164) throw new Error('phone-digits-lost')
      const res = await verifyRegistration({
        phone: e164,
        otp: code,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        patronymic: patronymic.trim() ? patronymic.trim() : null,
        iin,
        clientKind: 'web',
      })
      setSession(res)
      router.push('/me')
    } catch (err) {
      if (err instanceof AppError) {
        const mapped = mapVerifyError(err)
        triggerShake(mapped)
        // Reset OTP inputs on failure (mirror OtpForm pattern)
        setOtpDigits(['', '', '', '', '', ''])
        otpInputsRef.current[0]?.focus()
        // 409 → user must edit profile, send back to step 1
        if (err.code === 'PHONE_ALREADY_REGISTERED' || err.code === 'IIN_ALREADY_EXISTS') {
          setStep('profile')
          setFieldErrors(new Set(err.code === 'PHONE_ALREADY_REGISTERED' ? ['phone'] : ['iin']))
        }
      } else {
        triggerShake(t('auth.register.genericError'))
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
      if (chars.length === 6) void submitOtp(chars.join(''))
      return
    }

    const next = [...otpDigits]
    next[idx] = value.replace(/\D/g, '').slice(0, 1)
    setOtpDigits(next)

    if (next[idx] && idx < 5) {
      otpInputsRef.current[idx + 1]?.focus()
    }

    if (next.every((d) => d.length === 1) && next.join('').length === 6) {
      void submitOtp(next.join(''))
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

  const onResend = async () => {
    if (resendIn > 0 || resendLoading) return
    const e164 = toE164(phoneDigits)
    if (!e164) return
    setResendLoading(true)
    setError(null)
    try {
      await startRegistration(e164)
      setResendIn(RESEND_SECONDS)
    } catch (err) {
      if (err instanceof AppError) {
        setError(mapStartError(err))
      } else {
        setError(t('auth.register.genericError'))
      }
    } finally {
      setResendLoading(false)
    }
  }

  const onBackToProfile = () => {
    setStep('profile')
    setError(null)
    setOtpDigits(['', '', '', '', '', ''])
  }

  const lastNameInvalid = fieldErrors.has('lastName')
  const firstNameInvalid = fieldErrors.has('firstName')
  const iinInvalid = fieldErrors.has('iin')
  const phoneInvalid = fieldErrors.has('phone')

  if (step === 'otp') {
    const e164 = toE164(phoneDigits) ?? phoneDigits
    const masked = maskPhoneForDisplay(e164)
    return (
      <div className="flex flex-col gap-5">
        <div className="text-sm text-text-secondary">
          {t('auth.register.verifySubtitle')}{' '}
          <span className="text-text-primary font-mono-numbers">{masked}</span>
        </div>

        <motion.div
          key={shake}
          initial={false}
          animate={shake > 0 ? { x: [0, -4, 4, -4, 4, 0] } : { x: 0 }}
          transition={{ duration: 0.4 }}
          className="flex items-center justify-between gap-1.5 md:gap-2"
        >
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
            onClick={onBackToProfile}
            className="text-text-secondary hover:text-text-primary transition-colors"
          >
            ← {t('auth.register.edit')}
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
      </div>
    )
  }

  return (
    <motion.form
      key={shake}
      onSubmit={onSubmitProfile}
      className="flex flex-col gap-4"
      initial={false}
      animate={shake > 0 ? { x: [0, -4, 4, -4, 4, 0] } : { x: 0 }}
      transition={{ duration: 0.4 }}
      noValidate
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FieldRow
          id="lastName"
          label={t('auth.register.lastNameLabel')}
          icon={<User className="size-4 text-text-tertiary" aria-hidden />}
          input={
            <Input
              id="lastName"
              type="text"
              autoComplete="family-name"
              placeholder={t('auth.register.lastNamePlaceholder')}
              value={lastName}
              onChange={(e) => {
                setLastName(e.target.value)
                if (error) setError(null)
                if (fieldErrors.has('lastName')) clearFieldError('lastName')
              }}
              className="pl-9"
              invalid={lastNameInvalid}
            />
          }
        />

        <FieldRow
          id="firstName"
          label={t('auth.register.firstNameLabel')}
          icon={<User className="size-4 text-text-tertiary" aria-hidden />}
          input={
            <Input
              id="firstName"
              type="text"
              autoComplete="given-name"
              placeholder={t('auth.register.firstNamePlaceholder')}
              value={firstName}
              onChange={(e) => {
                setFirstName(e.target.value)
                if (error) setError(null)
                if (fieldErrors.has('firstName')) clearFieldError('firstName')
              }}
              className="pl-9"
              invalid={firstNameInvalid}
            />
          }
        />
      </div>

      <FieldRow
        id="patronymic"
        label={
          <>
            {t('auth.register.patronymicLabel')}{' '}
            <span className="text-text-tertiary font-normal">
              · {t('auth.register.patronymicHint')}
            </span>
          </>
        }
        icon={<UserCircle2 className="size-4 text-text-tertiary" aria-hidden />}
        input={
          <Input
            id="patronymic"
            type="text"
            autoComplete="additional-name"
            placeholder={t('auth.register.patronymicPlaceholder')}
            value={patronymic}
            onChange={(e) => {
              setPatronymic(e.target.value)
              if (error) setError(null)
            }}
            className="pl-9"
          />
        }
      />

      <FieldRow
        id="iin"
        label={t('auth.register.iinLabel')}
        icon={<CreditCard className="size-4 text-text-tertiary" aria-hidden />}
        input={
          <Input
            id="iin"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder={t('auth.register.iinPlaceholder')}
            value={iin}
            onChange={(e) => onIinChange(e.target.value)}
            className="pl-9 font-mono-numbers"
            invalid={iinInvalid}
            maxLength={12}
          />
        }
      />

      <FieldRow
        id="phone"
        label={t('auth.register.phoneLabel')}
        icon={<Phone className="size-4 text-text-tertiary" aria-hidden />}
        input={
          <Input
            id="phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder={t('auth.register.phonePlaceholder')}
            value={phoneDisplay}
            onChange={(e) => onPhoneChange(e.target.value)}
            className="pl-9"
            invalid={phoneInvalid}
          />
        }
      />

      {error ? (
        <div
          role="alert"
          className="text-sm text-danger bg-danger/10 border border-danger/25 rounded-md px-3 py-2"
        >
          {error}
        </div>
      ) : null}

      <Button type="submit" variant="primary" size="lg" block loading={loading}>
        {t('auth.register.submit')}
        {!loading && <ArrowRight className="size-4" aria-hidden />}
      </Button>

      <div className="text-sm text-center text-text-secondary">
        {t('auth.register.haveAccount')}{' '}
        <Link href="/login" className="text-brand-500 hover:text-brand-400 font-medium">
          {t('auth.register.loginLink')}
        </Link>
      </div>
    </motion.form>
  )
}

interface FieldRowProps {
  id: string
  label: React.ReactNode
  icon: React.ReactNode
  input: React.ReactNode
}

function FieldRow({ id, label, icon, input }: FieldRowProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-text-secondary">
        {label}
      </label>
      <div className="relative">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">{icon}</div>
        {input}
      </div>
    </div>
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

function mapStartError(err: AppError): string {
  switch (err.code) {
    case 'PHONE_ALREADY_REGISTERED':
      return t('auth.register.phoneAlreadyRegistered')
    case 'RATE_LIMITED':
    case 'SMS_RATE_LIMITED':
      return t('auth.register.rateLimited')
    case 'SMS_DELIVERY_FAILED':
      return t('auth.register.smsDeliveryFailed')
    default:
      return err.message || t('auth.register.genericError')
  }
}

function mapVerifyError(err: AppError): string {
  switch (err.code) {
    case 'SMS_CODE_INVALID_OR_EXPIRED':
    case 'INVALID_CODE':
    case 'CODE_EXPIRED':
    case 'MAX_ATTEMPTS_EXCEEDED':
      return t('auth.register.invalidOrExpiredCode')
    case 'PHONE_ALREADY_REGISTERED':
      return t('auth.register.phoneAlreadyRegistered')
    case 'IIN_ALREADY_EXISTS':
      return t('auth.register.iinAlreadyExists')
    case 'RATE_LIMITED':
    case 'SMS_RATE_LIMITED':
      return t('auth.register.rateLimited')
    default:
      return err.message || t('auth.register.genericError')
  }
}

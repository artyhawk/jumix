'use client'

import { isAppError } from '@/lib/api/errors'
import { submitPublicSurveyResponse } from '@/lib/api/surveys-public'
import { cn } from '@/lib/utils'
import type { SurveyQuestion, SurveyWithQuestions } from '@jumix/shared'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, ArrowRight, CheckCircle2, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { HoneypotField } from './honeypot-field'
import { SurveyProgress } from './survey-progress'

const PREMIUM_EASE = [0.22, 1, 0.36, 1] as const
const SUCCESS_REDIRECT_MS = 5000

type Stage =
  | { type: 'intro' }
  | { type: 'question'; index: number }
  | { type: 'contact' }
  | { type: 'submitting' }
  | { type: 'success' }
  | { type: 'error'; message: string }

interface ContactState {
  fullName: string
  phone: string
  email: string
}

const PHONE_RE = /^\+7[0-9]{10}$/
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

function stageKey(stage: Stage): string {
  switch (stage.type) {
    case 'question':
      return `q-${stage.index}`
    case 'error':
      return 'error'
    default:
      return stage.type
  }
}

/** Compute group sections from ordered questions. */
function buildGroups(
  questions: SurveyQuestion[],
): Array<{ key: string; title: string; positions: number[] }> {
  const groups: Array<{ key: string; title: string; positions: number[] }> = []
  for (const q of questions) {
    const last = groups[groups.length - 1]
    if (last && last.key === q.groupKey) {
      last.positions.push(q.position)
    } else {
      groups.push({ key: q.groupKey, title: q.groupTitle, positions: [q.position] })
    }
  }
  return groups
}

export function SurveyFlow({ survey }: { survey: SurveyWithQuestions }) {
  const router = useRouter()
  const reduceMotion = useReducedMotion()
  const [stage, setStage] = useState<Stage>({ type: 'intro' })
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [contact, setContact] = useState<ContactState>({ fullName: '', phone: '', email: '' })
  const [contactErrors, setContactErrors] = useState<Partial<Record<keyof ContactState, string>>>(
    {},
  )
  const [questionError, setQuestionError] = useState<string | null>(null)
  const [honeypot, setHoneypot] = useState('')
  const containerRef = useRef<HTMLDivElement | null>(null)

  const questions = survey.questions
  const groups = useMemo(() => buildGroups(questions), [questions])

  // Total steps for progress bar: intro NOT counted; questions + contact counted.
  const totalSteps = questions.length + 1
  const currentStep = useMemo(() => {
    switch (stage.type) {
      case 'question':
        return stage.index + 1
      case 'contact':
        return questions.length + 1
      case 'submitting':
      case 'success':
        return totalSteps
      default:
        return 0
    }
  }, [stage, questions.length, totalSteps])

  const groupContext = useMemo(() => {
    if (stage.type !== 'question') return null
    const q = questions[stage.index]
    if (!q) return null
    const idx = groups.findIndex((g) => g.key === q.groupKey)
    return idx >= 0
      ? { title: groups[idx]?.title ?? '', index: idx + 1, total: groups.length }
      : null
  }, [stage, questions, groups])

  // Auto-redirect к landing после success.
  useEffect(() => {
    if (stage.type !== 'success') return
    const t = window.setTimeout(() => router.push('/'), SUCCESS_REDIRECT_MS)
    return () => window.clearTimeout(t)
  }, [stage, router])

  // Warn before unload if there are unsaved answers.
  useEffect(() => {
    if (stage.type === 'success' || stage.type === 'submitting' || stage.type === 'intro') return
    const hasContent =
      Object.values(answers).some((v) => v.trim().length > 0) ||
      Object.values(contact).some((v) => v.trim().length > 0)
    if (!hasContent) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [stage, answers, contact])

  // Scroll to top on stage change for clean focus.
  useEffect(() => {
    containerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const goToQuestion = (index: number) => {
    setQuestionError(null)
    if (index < 0) {
      setStage({ type: 'intro' })
      return
    }
    if (index >= questions.length) {
      setStage({ type: 'contact' })
      return
    }
    setStage({ type: 'question', index })
  }

  const handleStart = () => {
    if (questions.length === 0) {
      setStage({ type: 'contact' })
      return
    }
    setStage({ type: 'question', index: 0 })
  }

  const handleNextQuestion = () => {
    if (stage.type !== 'question') return
    const q = questions[stage.index]
    if (!q) return
    const value = answers[q.position]?.trim() ?? ''
    if (q.isRequired && value.length === 0) {
      setQuestionError('Пожалуйста, ответьте на вопрос')
      return
    }
    goToQuestion(stage.index + 1)
  }

  const handlePrevQuestion = () => {
    if (stage.type === 'question') {
      goToQuestion(stage.index - 1)
    } else if (stage.type === 'contact') {
      goToQuestion(questions.length - 1)
    }
  }

  const validateContact = (): boolean => {
    const errs: Partial<Record<keyof ContactState, string>> = {}
    if (contact.fullName.trim().length < 2) errs.fullName = 'Введите имя и фамилию'
    if (!PHONE_RE.test(contact.phone)) errs.phone = 'Формат: +7XXXXXXXXXX'
    if (!EMAIL_RE.test(contact.email.trim())) errs.email = 'Неверный формат email'
    setContactErrors(errs)
    return Object.keys(errs).length === 0
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!validateContact()) return

    // Build payload: keys must be position-as-string.
    const payloadAnswers: Record<string, string> = {}
    for (const q of questions) {
      const v = answers[q.position]?.trim() ?? ''
      if (v.length > 0) payloadAnswers[String(q.position)] = v
    }

    setStage({ type: 'submitting' })
    try {
      await submitPublicSurveyResponse(survey.slug, {
        fullName: contact.fullName.trim(),
        phone: contact.phone.trim(),
        email: contact.email.trim(),
        answers: payloadAnswers,
        honeypot: honeypot || undefined,
      })
      setStage({ type: 'success' })
    } catch (err) {
      const code = isAppError(err) ? err.code : 'NETWORK_ERROR'
      let message = 'Не удалось отправить ответ. Попробуйте ещё раз.'
      if (code === 'RATE_LIMIT_EXCEEDED') {
        message = 'Слишком много отправок с этого адреса. Попробуйте позже.'
      } else if (code === 'MISSING_REQUIRED_ANSWERS') {
        message = 'Пожалуйста, заполните все обязательные вопросы.'
      } else if (code === 'SURVEY_NOT_FOUND') {
        message = 'Опрос больше недоступен.'
      } else if (code === 'NETWORK_ERROR') {
        message = 'Нет связи с сервером. Проверьте подключение.'
      } else if (isAppError(err)) {
        message = err.message
      }
      setStage({ type: 'error', message })
    }
  }

  const motionProps = reduceMotion
    ? {}
    : {
        initial: { opacity: 0, y: 24 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -24 },
        transition: { duration: 0.4, ease: PREMIUM_EASE },
      }

  return (
    <section
      ref={containerRef}
      className="relative min-h-[calc(100dvh-4rem)] flex items-start justify-center px-5 md:px-8 py-12 md:py-20"
    >
      <div className="absolute inset-0 m-radial-hero pointer-events-none" aria-hidden />
      <div className="absolute inset-0 m-grid-bg opacity-50 pointer-events-none" aria-hidden />

      <div className="relative w-full max-w-2xl">
        {stage.type !== 'intro' &&
        stage.type !== 'success' &&
        stage.type !== 'error' &&
        stage.type !== 'submitting' ? (
          <div className="mb-8">
            <SurveyProgress
              currentStep={currentStep}
              totalSteps={totalSteps}
              groupTitle={groupContext?.title}
              groupIndex={groupContext?.index}
              groupTotal={groupContext?.total}
            />
          </div>
        ) : null}

        <AnimatePresence mode="wait">
          <motion.div key={stageKey(stage)} {...motionProps}>
            {stage.type === 'intro' ? <IntroStage survey={survey} onStart={handleStart} /> : null}

            {stage.type === 'question' ? (
              <QuestionStage
                question={questions[stage.index] ?? null}
                value={answers[questions[stage.index]?.position ?? -1] ?? ''}
                onChange={(v) => {
                  const q = questions[stage.index]
                  if (!q) return
                  setAnswers((prev) => ({ ...prev, [q.position]: v }))
                  if (questionError) setQuestionError(null)
                }}
                error={questionError}
                onPrev={handlePrevQuestion}
                onNext={handleNextQuestion}
                isFirst={stage.index === 0}
                isLast={stage.index === questions.length - 1}
              />
            ) : null}

            {stage.type === 'contact' ? (
              <ContactStage
                contact={contact}
                onChange={(field, value) => {
                  setContact((prev) => ({ ...prev, [field]: value }))
                  if (contactErrors[field]) {
                    setContactErrors((prev) => ({ ...prev, [field]: undefined }))
                  }
                }}
                errors={contactErrors}
                honeypot={honeypot}
                onHoneypotChange={setHoneypot}
                onPrev={handlePrevQuestion}
                onSubmit={handleSubmit}
              />
            ) : null}

            {stage.type === 'submitting' ? <SubmittingStage /> : null}

            {stage.type === 'success' ? (
              <SuccessStage outro={survey.outro} onReturn={() => router.push('/')} />
            ) : null}

            {stage.type === 'error' ? (
              <ErrorStage message={stage.message} onRetry={() => setStage({ type: 'contact' })} />
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  )
}

// ----------------------------------------------------------------------------
// Stages
// ----------------------------------------------------------------------------

function IntroStage({
  survey,
  onStart,
}: {
  survey: SurveyWithQuestions
  onStart: () => void
}) {
  return (
    <div className="m-card p-8 md:p-12 space-y-6">
      <div className="space-y-3">
        <span className="inline-flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] uppercase text-[var(--m-brand)]">
          <span className="size-1 rounded-full bg-[var(--m-brand)]" aria-hidden />
          {survey.subtitle}
        </span>
        <h1
          className="font-semibold tracking-tight m-text-balance text-[var(--m-fg)]"
          style={{ fontSize: 'clamp(1.75rem, 2.4vw + 1.25rem, 2.75rem)', lineHeight: 1.1 }}
        >
          {survey.title}
        </h1>
      </div>
      <p className="text-[15px] md:text-[16px] text-[var(--m-fg-secondary)] leading-relaxed">
        {survey.intro}
      </p>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-[var(--m-fg-tertiary)]">
        <span>{survey.questions.length} вопросов</span>
        <span aria-hidden>·</span>
        <span>{survey.audience === 'b2b' ? '10–15 минут' : '5–10 минут'}</span>
      </div>
      <div className="pt-2">
        <PrimaryButton onClick={onStart}>
          Начать
          <ArrowRight className="size-[18px]" aria-hidden />
        </PrimaryButton>
      </div>
    </div>
  )
}

function QuestionStage({
  question,
  value,
  onChange,
  error,
  onPrev,
  onNext,
  isFirst,
  isLast,
}: {
  question: {
    position: number
    questionText: string
    hint: string | null
    isRequired: boolean
  } | null
  value: string
  onChange: (next: string) => void
  error: string | null
  onPrev: () => void
  onNext: () => void
  isFirst: boolean
  isLast: boolean
}) {
  if (!question) return null
  return (
    <form
      className="m-card p-7 md:p-10 space-y-6"
      onSubmit={(e) => {
        e.preventDefault()
        onNext()
      }}
    >
      <div className="space-y-3">
        <h2
          className="font-semibold tracking-tight text-[var(--m-fg)] m-text-balance"
          style={{ fontSize: 'clamp(1.25rem, 1.4vw + 0.9rem, 1.75rem)', lineHeight: 1.2 }}
        >
          {question.questionText}
          {question.isRequired ? (
            <span className="ml-1 text-[var(--m-brand)]" aria-hidden>
              *
            </span>
          ) : null}
        </h2>
        {question.hint ? (
          <p className="text-[13px] text-[var(--m-fg-tertiary)]">{question.hint}</p>
        ) : null}
      </div>
      <textarea
        ref={(el) => el?.focus()}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={5}
        placeholder="Ваш ответ…"
        className={cn(
          'w-full resize-y min-h-[140px] rounded-[14px] border bg-[var(--m-surface)] px-4 py-3.5',
          'text-[15px] text-[var(--m-fg)] placeholder:text-[var(--m-fg-tertiary)]',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--m-brand)]',
          'transition-colors duration-200',
          error
            ? 'border-[#ef4444]'
            : 'border-[var(--m-border-strong)] focus:border-[var(--m-brand)]',
        )}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `q-${question.position}-error` : undefined}
      />
      {error ? (
        <p id={`q-${question.position}-error`} className="text-[13px] text-[#ef4444]">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
        <SecondaryButton onClick={onPrev}>
          <ArrowLeft className="size-[16px]" aria-hidden />
          {isFirst ? 'К началу' : 'Назад'}
        </SecondaryButton>
        <PrimaryButton type="submit">
          {isLast ? 'К контактам' : 'Далее'}
          <ArrowRight className="size-[18px]" aria-hidden />
        </PrimaryButton>
      </div>
    </form>
  )
}

function ContactStage({
  contact,
  onChange,
  errors,
  honeypot,
  onHoneypotChange,
  onPrev,
  onSubmit,
}: {
  contact: ContactState
  onChange: (field: keyof ContactState, value: string) => void
  errors: Partial<Record<keyof ContactState, string>>
  honeypot: string
  onHoneypotChange: (next: string) => void
  onPrev: () => void
  onSubmit: (e: FormEvent) => void
}) {
  return (
    <form className="m-card p-7 md:p-10 space-y-6" onSubmit={onSubmit}>
      <div className="space-y-2">
        <h2
          className="font-semibold tracking-tight text-[var(--m-fg)]"
          style={{ fontSize: 'clamp(1.25rem, 1.4vw + 0.9rem, 1.75rem)', lineHeight: 1.2 }}
        >
          Как с вами связаться?
        </h2>
        <p className="text-[14px] text-[var(--m-fg-secondary)] leading-relaxed">
          Мы свяжемся, когда платформа будет готова к пилоту. Никакого спама.
        </p>
      </div>

      <div className="space-y-4">
        <ContactField
          label="ФИО"
          autoComplete="name"
          value={contact.fullName}
          onChange={(v) => onChange('fullName', v)}
          error={errors.fullName}
          placeholder="Иван Иванов"
        />
        <ContactField
          label="Телефон"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={contact.phone}
          onChange={(v) => onChange('phone', v)}
          error={errors.phone}
          placeholder="+77001234567"
        />
        <ContactField
          label="Email"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={contact.email}
          onChange={(v) => onChange('email', v)}
          error={errors.email}
          placeholder="you@example.com"
        />
      </div>

      <HoneypotField value={honeypot} onChange={onHoneypotChange} />

      <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
        <SecondaryButton onClick={onPrev}>
          <ArrowLeft className="size-[16px]" aria-hidden />
          Назад
        </SecondaryButton>
        <PrimaryButton type="submit">
          Отправить
          <ArrowRight className="size-[18px]" aria-hidden />
        </PrimaryButton>
      </div>
    </form>
  )
}

function ContactField({
  label,
  value,
  onChange,
  error,
  placeholder,
  type = 'text',
  inputMode,
  autoComplete,
}: {
  label: string
  value: string
  onChange: (next: string) => void
  error?: string
  placeholder?: string
  type?: string
  inputMode?: 'text' | 'tel' | 'email'
  autoComplete?: string
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[13px] font-medium text-[var(--m-fg-secondary)]">{label}</span>
      <input
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          'w-full rounded-[12px] border bg-[var(--m-surface)] px-4 py-3',
          'text-[15px] text-[var(--m-fg)] placeholder:text-[var(--m-fg-tertiary)]',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--m-brand)]',
          'transition-colors duration-200',
          error
            ? 'border-[#ef4444]'
            : 'border-[var(--m-border-strong)] focus:border-[var(--m-brand)]',
        )}
        aria-invalid={Boolean(error)}
      />
      {error ? <p className="text-[12px] text-[#ef4444]">{error}</p> : null}
    </label>
  )
}

function SubmittingStage() {
  return (
    <div className="m-card p-10 md:p-14 flex flex-col items-center text-center gap-5">
      <Loader2 className="size-10 animate-spin text-[var(--m-brand)]" aria-hidden />
      <p className="text-[15px] text-[var(--m-fg-secondary)]">Отправляем ваш ответ…</p>
    </div>
  )
}

function SuccessStage({ outro, onReturn }: { outro: string; onReturn: () => void }) {
  return (
    <div className="m-card p-10 md:p-14 flex flex-col items-center text-center gap-6">
      <div
        className="inline-flex size-16 items-center justify-center rounded-full"
        style={{ background: 'var(--m-brand-glow)' }}
      >
        <CheckCircle2 className="size-8 text-[var(--m-brand)]" aria-hidden />
      </div>
      <div className="space-y-3">
        <h2
          className="font-semibold tracking-tight text-[var(--m-fg)]"
          style={{ fontSize: 'clamp(1.5rem, 1.6vw + 1rem, 2rem)', lineHeight: 1.15 }}
        >
          Спасибо за ответы!
        </h2>
        <p className="text-[15px] text-[var(--m-fg-secondary)] leading-relaxed max-w-md">{outro}</p>
      </div>
      <div className="pt-2">
        <PrimaryButton onClick={onReturn}>Вернуться на главную</PrimaryButton>
      </div>
      <p className="text-[12px] text-[var(--m-fg-tertiary)]">
        Автоматическое перенаправление через несколько секунд…
      </p>
    </div>
  )
}

function ErrorStage({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="m-card p-8 md:p-12 space-y-5">
      <h2 className="text-[18px] font-semibold text-[var(--m-fg)]">Что-то пошло не так</h2>
      <p className="text-[14px] text-[var(--m-fg-secondary)] leading-relaxed">{message}</p>
      <PrimaryButton onClick={onRetry}>Попробовать ещё раз</PrimaryButton>
    </div>
  )
}

// ----------------------------------------------------------------------------
// Buttons
// ----------------------------------------------------------------------------

function PrimaryButton({
  children,
  onClick,
  type = 'button',
  disabled,
}: {
  children: React.ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
  disabled?: boolean
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[12px] font-medium',
        'transition-colors duration-200 select-none',
        'min-h-[52px] md:h-14 px-7 text-[15px]',
        'bg-[var(--m-brand)] text-[#0a0a0b] hover:bg-[var(--m-brand-hover)] m-cta-glow',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--m-brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--m-bg)]',
        'disabled:opacity-50 disabled:cursor-not-allowed',
      )}
    >
      {children}
    </button>
  )
}

function SecondaryButton({
  children,
  onClick,
  type = 'button',
}: {
  children: React.ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      className={cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[12px] font-medium',
        'transition-colors duration-200 select-none',
        'min-h-[52px] md:h-14 px-6 text-[14px]',
        'border border-[var(--m-border-strong)] text-[var(--m-fg-secondary)]',
        'hover:border-[var(--m-brand)] hover:text-[var(--m-fg)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--m-brand)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--m-bg)]',
      )}
    >
      {children}
    </button>
  )
}

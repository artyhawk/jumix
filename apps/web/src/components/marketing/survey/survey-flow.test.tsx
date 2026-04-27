import type { SurveyWithQuestions } from '@jumix/shared'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}))

vi.mock('@/lib/api/surveys-public', () => ({
  submitPublicSurveyResponse: vi.fn(),
}))

// framer-motion в jsdom: disable animations + always-render оба children
// AnimatePresence (mode="wait" ждёт exit, что в тестах залипает). Заменяем
// motion.div на простой div, AnimatePresence на passthrough.
vi.mock('framer-motion', async () => {
  const actual = await vi.importActual<typeof import('framer-motion')>('framer-motion')
  return {
    ...actual,
    motion: new Proxy(
      {},
      {
        get: () => {
          return ({
            children,
            ...props
          }: { children?: React.ReactNode } & Record<string, unknown>) => {
            // Strip framer-motion-specific props (initial, animate, exit, transition, ...)
            const safeProps: Record<string, unknown> = {}
            for (const [k, v] of Object.entries(props)) {
              if (
                k === 'initial' ||
                k === 'animate' ||
                k === 'exit' ||
                k === 'transition' ||
                k === 'whileHover' ||
                k === 'whileTap' ||
                k === 'whileInView' ||
                k === 'viewport' ||
                k === 'variants' ||
                k === 'layout'
              )
                continue
              safeProps[k] = v
            }
            return <div {...(safeProps as React.HTMLAttributes<HTMLDivElement>)}>{children}</div>
          }
        },
      },
    ) as unknown as typeof actual.motion,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useReducedMotion: () => true,
  }
})

import { submitPublicSurveyResponse } from '@/lib/api/surveys-public'
import { SurveyFlow } from './survey-flow'

const submit = vi.mocked(submitPublicSurveyResponse)

function makeSurvey(overrides: Partial<SurveyWithQuestions> = {}): SurveyWithQuestions {
  return {
    id: 's1',
    slug: 'b2b-ru-test',
    title: 'Test Survey',
    subtitle: 'Тест',
    audience: 'b2b',
    locale: 'ru',
    intro: 'Helpful intro text',
    outro: 'Thanks!',
    questionCount: 2,
    isActive: true,
    createdAt: '2026-04-01T00:00:00Z',
    questions: [
      {
        id: 'q1',
        surveyId: 's1',
        position: 1,
        groupKey: 'context',
        groupTitle: 'Контекст',
        questionText: 'Сколько кранов?',
        hint: null,
        isRequired: true,
      },
      {
        id: 'q2',
        surveyId: 's1',
        position: 2,
        groupKey: 'pain',
        groupTitle: 'Болит',
        questionText: 'Что мешает?',
        hint: null,
        isRequired: false,
      },
    ],
    ...overrides,
  }
}

beforeEach(() => {
  submit.mockReset()
})

describe('SurveyFlow', () => {
  it('renders intro stage with title and start button', () => {
    render(<SurveyFlow survey={makeSurvey()} />)
    expect(screen.getByText('Test Survey')).toBeInTheDocument()
    expect(screen.getByText('Helpful intro text')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Начать/i })).toBeInTheDocument()
  })

  it('advances к first question on click "Начать"', async () => {
    render(<SurveyFlow survey={makeSurvey()} />)
    fireEvent.click(screen.getByRole('button', { name: /Начать/i }))
    expect(await screen.findByText('Сколько кранов?')).toBeInTheDocument()
  })

  it('shows progress bar with current step / total', async () => {
    render(<SurveyFlow survey={makeSurvey()} />)
    fireEvent.click(screen.getByRole('button', { name: /Начать/i }))
    await screen.findByText('Сколько кранов?')
    // total = 2 questions + 1 contact = 3
    expect(screen.getByText(/1 из 3/)).toBeInTheDocument()
    expect(screen.getByText(/Раздел 1 из 2: Контекст/)).toBeInTheDocument()
  })

  it('blocks Next когда required answer is empty', async () => {
    render(<SurveyFlow survey={makeSurvey()} />)
    fireEvent.click(screen.getByRole('button', { name: /Начать/i }))
    await screen.findByText('Сколько кранов?')
    fireEvent.click(screen.getByRole('button', { name: /Далее/i }))
    expect(await screen.findByText(/Пожалуйста, ответьте на вопрос/i)).toBeInTheDocument()
    // Still on Q1
    expect(screen.getByText('Сколько кранов?')).toBeInTheDocument()
  })

  it('preserves answers when going back', async () => {
    render(<SurveyFlow survey={makeSurvey()} />)
    fireEvent.click(screen.getByRole('button', { name: /Начать/i }))
    await screen.findByText('Сколько кранов?')
    fireEvent.change(screen.getByPlaceholderText('Ваш ответ…'), {
      target: { value: 'Пять кранов' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Далее/i }))
    expect(await screen.findByText('Что мешает?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Назад/i }))
    expect(await screen.findByDisplayValue('Пять кранов')).toBeInTheDocument()
  })

  it('reaches contact stage after все вопросы', async () => {
    render(<SurveyFlow survey={makeSurvey()} />)
    fireEvent.click(screen.getByRole('button', { name: /Начать/i }))
    await screen.findByText('Сколько кранов?')
    fireEvent.change(screen.getByPlaceholderText('Ваш ответ…'), { target: { value: 'a' } })
    fireEvent.click(screen.getByRole('button', { name: /Далее/i }))
    await screen.findByText('Что мешает?')
    fireEvent.click(screen.getByRole('button', { name: /К контактам/i }))
    expect(await screen.findByText(/Как с вами связаться/i)).toBeInTheDocument()
  })

  it('validates contact fields на submit', async () => {
    render(<SurveyFlow survey={makeSurvey()} />)
    fireEvent.click(screen.getByRole('button', { name: /Начать/i }))
    await screen.findByText('Сколько кранов?')
    fireEvent.change(screen.getByPlaceholderText('Ваш ответ…'), { target: { value: 'a' } })
    fireEvent.click(screen.getByRole('button', { name: /Далее/i }))
    await screen.findByText('Что мешает?')
    fireEvent.click(screen.getByRole('button', { name: /К контактам/i }))
    await screen.findByText(/Как с вами связаться/i)

    fireEvent.click(screen.getByRole('button', { name: /Отправить/i }))
    expect(await screen.findByText(/Введите имя и фамилию/i)).toBeInTheDocument()
    expect(screen.getByText(/Формат: \+7XXXXXXXXXX/i)).toBeInTheDocument()
    expect(screen.getByText(/Неверный формат email/i)).toBeInTheDocument()
    expect(submit).not.toHaveBeenCalled()
  })

  it('submits valid form и shows success stage', async () => {
    submit.mockResolvedValueOnce({ id: 'r1', submittedAt: '2026-04-25T10:00:00Z' })
    render(<SurveyFlow survey={makeSurvey()} />)
    fireEvent.click(screen.getByRole('button', { name: /Начать/i }))
    await screen.findByText('Сколько кранов?')
    fireEvent.change(screen.getByPlaceholderText('Ваш ответ…'), { target: { value: 'a' } })
    fireEvent.click(screen.getByRole('button', { name: /Далее/i }))
    await screen.findByText('Что мешает?')
    fireEvent.click(screen.getByRole('button', { name: /К контактам/i }))
    await screen.findByText(/Как с вами связаться/i)

    fireEvent.change(screen.getByPlaceholderText('Иван Иванов'), {
      target: { value: 'Иван Иванов' },
    })
    fireEvent.change(screen.getByPlaceholderText('+77001234567'), {
      target: { value: '+77001234567' },
    })
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'i@i.kz' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Отправить/i }))

    expect(await screen.findByText('Спасибо за ответы!')).toBeInTheDocument()
    expect(submit).toHaveBeenCalledWith(
      'b2b-ru-test',
      expect.objectContaining({
        fullName: 'Иван Иванов',
        phone: '+77001234567',
        email: 'i@i.kz',
        answers: { '1': 'a' },
      }),
    )
  })

  it('renders honeypot field как hidden но focusable через DOM', async () => {
    render(<SurveyFlow survey={makeSurvey()} />)
    fireEvent.click(screen.getByRole('button', { name: /Начать/i }))
    await screen.findByText('Сколько кранов?')
    fireEvent.change(screen.getByPlaceholderText('Ваш ответ…'), { target: { value: 'a' } })
    fireEvent.click(screen.getByRole('button', { name: /Далее/i }))
    await screen.findByText('Что мешает?')
    fireEvent.click(screen.getByRole('button', { name: /К контактам/i }))
    await screen.findByText(/Как с вами связаться/i)

    const honeypot = document.querySelector('input[name="website_url"]') as HTMLInputElement | null
    expect(honeypot).not.toBeNull()
    expect(honeypot?.tabIndex).toBe(-1)
    expect(honeypot?.autocomplete).toBe('off')
  })

  it('shows error stage when submission fails', async () => {
    submit.mockRejectedValueOnce(new Error('boom'))
    render(<SurveyFlow survey={makeSurvey()} />)
    fireEvent.click(screen.getByRole('button', { name: /Начать/i }))
    await screen.findByText('Сколько кранов?')
    fireEvent.change(screen.getByPlaceholderText('Ваш ответ…'), { target: { value: 'a' } })
    fireEvent.click(screen.getByRole('button', { name: /Далее/i }))
    await screen.findByText('Что мешает?')
    fireEvent.click(screen.getByRole('button', { name: /К контактам/i }))
    await screen.findByText(/Как с вами связаться/i)
    fireEvent.change(screen.getByPlaceholderText('Иван Иванов'), {
      target: { value: 'Иван Иванов' },
    })
    fireEvent.change(screen.getByPlaceholderText('+77001234567'), {
      target: { value: '+77001234567' },
    })
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), {
      target: { value: 'i@i.kz' },
    })
    fireEvent.click(screen.getByRole('button', { name: /Отправить/i }))

    expect(await screen.findByText('Что-то пошло не так')).toBeInTheDocument()
  })
})

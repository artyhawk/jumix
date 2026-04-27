'use client'

import { PageHeader } from '@/components/layout/page-header'
import { PageTransition } from '@/components/motion/page-transition'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/use-auth'
import { formatRelativeTime } from '@/lib/format/time'
import { useAdminSurveysList } from '@/lib/hooks/use-surveys'
import { SURVEY_AUDIENCE_LABELS, SURVEY_LOCALE_LABELS, type SurveyListItem } from '@jumix/shared'
import { ClipboardList, ShieldAlert } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

/**
 * Admin /surveys (B3-SURVEY) — superadmin-only list of templates.
 *
 * Не page-table потому что surveys их единицы — лучше grid карточек с
 * counters. Click → /surveys/[slug] с responses table.
 */
export default function SurveysPage() {
  const { user } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (user && user.role !== 'superadmin') router.replace('/dashboard')
  }, [user, router])

  const { data, isLoading, isError, refetch } = useAdminSurveysList()

  if (!user || user.role !== 'superadmin') return null

  return (
    <PageTransition>
      <PageHeader
        title="Опросы"
        subtitle="Customer development surveys для двух сегментов на двух языках"
      />

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 mt-6">
          <Skeleton className="h-44 rounded-[12px]" />
          <Skeleton className="h-44 rounded-[12px]" />
          <Skeleton className="h-44 rounded-[12px]" />
          <Skeleton className="h-44 rounded-[12px]" />
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <ShieldAlert className="size-8 text-danger" strokeWidth={1.5} aria-hidden />
          <div className="text-sm text-text-secondary">Не удалось загрузить опросы</div>
          <Button variant="ghost" onClick={() => refetch()}>
            Повторить
          </Button>
        </div>
      ) : !data || data.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="Опросов пока нет"
          description="Запустите seed скрипт — pnpm --filter @jumix/db db:seed:surveys"
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 mt-6">
          {data.map((s) => (
            <SurveyTemplateCard key={s.id} survey={s} />
          ))}
        </div>
      )}
    </PageTransition>
  )
}

function SurveyTemplateCard({ survey }: { survey: SurveyListItem }) {
  return (
    <Link
      href={`/surveys/${encodeURIComponent(survey.slug)}`}
      className="group rounded-[12px] border border-border-subtle bg-layer-1 p-5 hover:bg-layer-2 hover:border-border-default transition-colors flex flex-col gap-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="text-base font-semibold text-text-primary group-hover:text-text-primary truncate">
            {survey.title}
          </h3>
          <code className="text-xs text-text-tertiary font-mono-numbers">{survey.slug}</code>
        </div>
        {!survey.isActive ? <Badge variant="inactive">Скрыт</Badge> : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="active">{SURVEY_AUDIENCE_LABELS[survey.audience]}</Badge>
        <Badge variant="inactive">{SURVEY_LOCALE_LABELS[survey.locale]}</Badge>
        <span className="text-xs text-text-tertiary">{survey.questionCount} вопросов</span>
      </div>

      <div className="mt-auto flex items-end justify-between gap-3 pt-2 border-t border-border-subtle">
        <div>
          <div className="text-2xl font-semibold tabular-nums text-text-primary group-hover:text-brand-500 transition-colors">
            {survey.responseCount}
          </div>
          <div className="text-xs text-text-tertiary">ответов</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-text-tertiary">Последний</div>
          <div className="text-xs text-text-secondary">
            {survey.latestResponseAt ? formatRelativeTime(survey.latestResponseAt) : '—'}
          </div>
        </div>
      </div>
    </Link>
  )
}

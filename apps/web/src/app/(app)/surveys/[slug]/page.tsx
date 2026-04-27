'use client'

import { SurveyResponseDrawer } from '@/components/drawers/survey-response-drawer'
import { PageHeader } from '@/components/layout/page-header'
import { PageTransition } from '@/components/motion/page-transition'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { EmptyState } from '@/components/ui/empty-state'
import { FilterBar } from '@/components/ui/filter-bar'
import { SearchInput } from '@/components/ui/search-input'
import { useAuth } from '@/hooks/use-auth'
import { formatRelativeTime } from '@/lib/format/time'
import { useAdminSurvey, useSurveyResponsesInfinite } from '@/lib/hooks/use-surveys'
import {
  SURVEY_AUDIENCE_LABELS,
  SURVEY_LOCALE_LABELS,
  type SurveyResponseListItem,
} from '@jumix/shared'
import { ClipboardList, ShieldAlert } from 'lucide-react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo } from 'react'

/**
 * Admin /surveys/[slug] (B3-SURVEY) — paginated responses table for one survey.
 *
 * URL state: q (search), spam (toggle honeypot inclusion), open (drawer id).
 * Date range фильтры — backlog (нужны для analytics, но MVP без них).
 */
export default function SurveyResponsesPage() {
  const { user } = useAuth()
  const router = useRouter()
  const params = useParams<{ slug: string }>()
  const search = useSearchParams()
  const slug = params.slug

  useEffect(() => {
    if (user && user.role !== 'superadmin') router.replace('/dashboard')
  }, [user, router])

  const q = search.get('q') ?? ''
  const includeSpam = search.get('spam') === '1'
  const openId = search.get('open')

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(search.toString())
    if (value === null || value === '') next.delete(key)
    else next.set(key, value)
    const qs = next.toString()
    router.replace(qs ? `/surveys/${slug}?${qs}` : `/surveys/${slug}`, { scroll: false })
  }

  const surveyQuery = useAdminSurvey(slug)
  const responsesQuery = useSurveyResponsesInfinite(slug, {
    q: q || undefined,
    includeSpam,
    limit: 20,
  })

  const rows = useMemo<SurveyResponseListItem[]>(
    () => responsesQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [responsesQuery.data],
  )

  const columns: DataTableColumn<SurveyResponseListItem>[] = [
    {
      key: 'fullName',
      header: 'ФИО',
      cell: (r) => (
        <span className="flex items-center gap-2">
          {r.fullName}
          {r.honeypotFilled ? (
            <Badge variant="rejected" withDot={false}>
              Спам
            </Badge>
          ) : null}
        </span>
      ),
    },
    {
      key: 'phone',
      header: 'Телефон',
      cell: (r) => <span className="font-mono-numbers">{r.phone}</span>,
      width: '160px',
    },
    {
      key: 'email',
      header: 'Email',
      cell: (r) => <span className="text-text-secondary truncate block">{r.email}</span>,
      width: '220px',
      muted: true,
    },
    {
      key: 'submittedAt',
      header: 'Когда',
      cell: (r) => formatRelativeTime(r.submittedAt),
      width: '140px',
      showOnMobile: false,
      muted: true,
    },
  ]

  if (!user || user.role !== 'superadmin') return null

  const survey = surveyQuery.data
  const subtitle = survey ? (
    <span className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
      <Badge variant="active">{SURVEY_AUDIENCE_LABELS[survey.audience]}</Badge>
      <Badge variant="inactive">{SURVEY_LOCALE_LABELS[survey.locale]}</Badge>
      {!survey.isActive ? <Badge variant="rejected">Скрыт</Badge> : null}
      <span>{survey.questionCount} вопросов</span>
    </span>
  ) : undefined

  return (
    <PageTransition>
      <PageHeader title={survey?.title ?? 'Опрос'} />
      {subtitle ? <div className="mt-2">{subtitle}</div> : null}
      {survey?.intro ? (
        <p className="mt-3 text-sm text-text-secondary leading-relaxed max-w-3xl">{survey.intro}</p>
      ) : null}

      <FilterBar className="mt-6">
        <SearchInput
          value={q}
          onDebouncedChange={(v) => setParam('q', v || null)}
          placeholder="Поиск по ФИО, телефону, email или ответам…"
          ariaLabel="Поиск ответов"
          className="md:w-[360px]"
        />
        <label className="inline-flex items-center gap-2 text-sm text-text-secondary cursor-pointer select-none min-h-[44px] md:min-h-0">
          <input
            type="checkbox"
            checked={includeSpam}
            onChange={(e) => setParam('spam', e.target.checked ? '1' : null)}
            className="size-4 rounded border-border-default bg-layer-1 text-brand-500 focus:ring-brand-500/30"
          />
          Показать спам
        </label>
      </FilterBar>

      {responsesQuery.isError ? (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <ShieldAlert className="size-8 text-danger" strokeWidth={1.5} aria-hidden />
          <div className="text-sm text-text-secondary">Не удалось загрузить ответы</div>
          <Button variant="ghost" onClick={() => responsesQuery.refetch()}>
            Повторить
          </Button>
        </div>
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          onRowClick={(r) => setParam('open', r.id)}
          loading={responsesQuery.isLoading}
          hasMore={responsesQuery.hasNextPage}
          loadingMore={responsesQuery.isFetchingNextPage}
          onLoadMore={() => responsesQuery.fetchNextPage()}
          mobileTitle={(r) => r.fullName}
          mobileSubtitle={(r) => `${r.phone} · ${r.email}`}
          ariaLabel="Список ответов"
          empty={
            q ? (
              <EmptyState
                icon={ClipboardList}
                title="Ничего не найдено"
                description="Попробуйте изменить запрос"
              />
            ) : (
              <EmptyState
                icon={ClipboardList}
                title="Ответов пока нет"
                description="Когда респонденты начнут отправлять ответы, они появятся здесь."
              />
            )
          }
        />
      )}

      <SurveyResponseDrawer
        slug={slug}
        id={openId}
        onOpenChange={(next) => {
          if (!next) setParam('open', null)
        }}
      />
    </PageTransition>
  )
}

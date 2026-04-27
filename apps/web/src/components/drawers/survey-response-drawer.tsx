'use client'

import { Badge } from '@/components/ui/badge'
import {
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerRoot,
  DrawerTitle,
} from '@/components/ui/drawer'
import { Skeleton } from '@/components/ui/skeleton'
import { formatRuDate } from '@/lib/format/date'
import { useSurveyResponseDetail } from '@/lib/hooks/use-surveys'
import { AlertTriangle, Mail, Phone } from 'lucide-react'
import { useMemo } from 'react'

interface Props {
  slug: string
  id: string | null
  onOpenChange: (open: boolean) => void
}

/**
 * Survey response detail drawer (B3-SURVEY). Read-only — нет mutations
 * (preserves data integrity для customer development analysis).
 *
 * Q&A list groups questions by groupKey (Раздел N: title), preserving
 * survey structure. Empty answers (skipped optional questions) показаны как
 * "—" чтобы было видно gap'ы.
 */
export function SurveyResponseDrawer({ slug, id, onOpenChange }: Props) {
  const query = useSurveyResponseDetail(slug, id)
  const detail = query.data

  const groups = useMemo(() => {
    if (!detail) return []
    const out: Array<{
      key: string
      title: string
      index: number
      total: number
      rows: typeof detail.answers
    }> = []
    for (const a of detail.answers) {
      const last = out[out.length - 1]
      if (last && last.key === a.groupKey) {
        last.rows.push(a)
      } else {
        out.push({ key: a.groupKey, title: a.groupTitle, index: 0, total: 0, rows: [a] })
      }
    }
    out.forEach((g, i) => {
      g.index = i + 1
      g.total = out.length
    })
    return out
  }, [detail])

  return (
    <DrawerRoot open={id !== null} onOpenChange={onOpenChange}>
      <DrawerContent aria-describedby={undefined}>
        <DrawerHeader className="pr-12">
          <DrawerTitle>{detail ? detail.fullName : 'Ответ на опрос'}</DrawerTitle>
        </DrawerHeader>
        <DrawerBody>
          {query.isPending ? (
            <DrawerSkeleton />
          ) : query.isError || !detail ? (
            <div className="text-sm text-text-secondary">Не удалось загрузить ответ.</div>
          ) : (
            <div className="space-y-6">
              {/* Spam warning */}
              {detail.honeypotFilled ? (
                <div className="flex items-start gap-3 rounded-[10px] border border-danger/30 bg-danger/5 p-3">
                  <AlertTriangle
                    className="size-4 text-danger mt-0.5 shrink-0"
                    strokeWidth={2}
                    aria-hidden
                  />
                  <div className="text-xs text-text-secondary leading-relaxed">
                    Этот ответ помечен как подозрительный (заполнен honeypot-field). Скорее всего —
                    bot.
                  </div>
                </div>
              ) : null}

              {/* Contact section */}
              <section className="space-y-3">
                <h3 className="text-xs uppercase tracking-wider text-text-tertiary font-medium">
                  Контакты
                </h3>
                <dl className="space-y-2">
                  <div className="flex items-center gap-2.5">
                    <Phone className="size-4 text-text-tertiary shrink-0" aria-hidden />
                    <a
                      href={`tel:${detail.phone}`}
                      className="text-sm text-text-primary hover:text-brand-500 transition-colors"
                    >
                      {detail.phone}
                    </a>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <Mail className="size-4 text-text-tertiary shrink-0" aria-hidden />
                    <a
                      href={`mailto:${detail.email}`}
                      className="text-sm text-text-primary hover:text-brand-500 transition-colors break-all"
                    >
                      {detail.email}
                    </a>
                  </div>
                </dl>
              </section>

              {/* Answers grouped */}
              <section className="space-y-5">
                <h3 className="text-xs uppercase tracking-wider text-text-tertiary font-medium">
                  Ответы
                </h3>
                {groups.map((g) => (
                  <div key={g.key} className="space-y-3">
                    <div className="text-[11px] uppercase tracking-[0.14em] text-brand-500 font-semibold">
                      Раздел {g.index} из {g.total}: {g.title}
                    </div>
                    <ol className="space-y-3">
                      {g.rows.map((a) => (
                        <li
                          key={a.position}
                          className="rounded-[10px] border border-border-subtle bg-layer-1 p-3 space-y-1.5"
                        >
                          <div className="text-[12px] text-text-tertiary">Вопрос {a.position}</div>
                          <div className="text-sm font-medium text-text-primary">
                            {a.questionText}
                          </div>
                          <div className="text-sm text-text-secondary whitespace-pre-wrap break-words">
                            {a.answer.length > 0 ? a.answer : '—'}
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                ))}
              </section>

              {/* Meta */}
              <section className="space-y-2 pt-2 border-t border-border-subtle">
                <h3 className="text-xs uppercase tracking-wider text-text-tertiary font-medium">
                  Метаданные
                </h3>
                <dl className="text-xs text-text-tertiary space-y-1">
                  <div>
                    <span>Отправлено: </span>
                    <span className="text-text-secondary">{formatRuDate(detail.submittedAt)}</span>
                  </div>
                  {detail.ipAddress ? (
                    <div>
                      <span>IP: </span>
                      <span className="font-mono-numbers text-text-secondary">
                        {detail.ipAddress}
                      </span>
                    </div>
                  ) : null}
                  {detail.userAgent ? (
                    <div>
                      <span>User Agent: </span>
                      <span className="text-text-secondary break-all">{detail.userAgent}</span>
                    </div>
                  ) : null}
                  <div>
                    <span>Опрос: </span>
                    <Badge variant="neutral">{detail.surveyTitle}</Badge>
                  </div>
                </dl>
              </section>
            </div>
          )}
        </DrawerBody>
      </DrawerContent>
    </DrawerRoot>
  )
}

function DrawerSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-12" />
      <Skeleton className="h-24" />
      <Skeleton className="h-24" />
      <Skeleton className="h-24" />
    </div>
  )
}

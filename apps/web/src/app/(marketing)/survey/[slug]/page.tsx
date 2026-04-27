import { SurveyFlow } from '@/components/marketing/survey/survey-flow'
import { isAppError } from '@/lib/api/errors'
import { getPublicSurvey } from '@/lib/api/surveys-public'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

/**
 * Public survey page (B3-SURVEY). Server component fetches survey + questions
 * once per request, then hands off в client SurveyFlow для interactive UX.
 *
 * Inactive / unknown slug → 404 (notFound() renders not-found.tsx). Network
 * errors propagate как обычная ошибка → error.tsx.
 */

interface Props {
  params: Promise<{ slug: string }>
}

async function fetchSurvey(slug: string) {
  try {
    return await getPublicSurvey(slug)
  } catch (err) {
    if (isAppError(err) && err.statusCode === 404) return null
    throw err
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const survey = await fetchSurvey(slug)
  if (!survey) return { title: 'Опрос не найден — Jumix' }
  return {
    title: `${survey.title} — Jumix`,
    description: survey.subtitle,
    robots: { index: false, follow: false },
  }
}

export default async function SurveyPage({ params }: Props) {
  const { slug } = await params
  const survey = await fetchSurvey(slug)
  if (!survey) notFound()

  return <SurveyFlow survey={survey} />
}

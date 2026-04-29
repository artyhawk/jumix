import { CheckCircle2 } from 'lucide-react'

type EmptyQueueType = 'crane-profiles' | 'hires' | 'cranes'

const EMPTY_MESSAGES: Record<EmptyQueueType, { title: string; subtitle: string }> = {
  'crane-profiles': {
    title: 'Нет заявок крановых',
    subtitle: 'Новые регистрации появятся здесь',
  },
  hires: {
    title: 'Нет запросов найма',
    subtitle: 'Компании пока никого не нанимают',
  },
  cranes: {
    title: 'Нет заявок на краны',
    subtitle: 'Добавленные компаниями краны появятся здесь',
  },
}

export function EmptyQueue({ type }: { type: EmptyQueueType }) {
  const { title, subtitle } = EMPTY_MESSAGES[type]
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="inline-flex items-center justify-center size-14 rounded-full bg-success/10 border border-success/20 mb-4">
        <CheckCircle2 className="size-7 text-success" strokeWidth={1.5} aria-hidden />
      </div>
      <h3 className="text-lg font-semibold text-text-primary mb-1">{title}</h3>
      <p className="text-sm text-text-secondary">{subtitle}</p>
    </div>
  )
}

import { Button } from '@/components/ui/button'
import { AlertCircle } from 'lucide-react'

export function QueueError({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="inline-flex items-center justify-center size-14 rounded-full bg-danger/10 border border-danger/20 mb-4">
        <AlertCircle className="size-7 text-danger" strokeWidth={1.5} aria-hidden />
      </div>
      <h3 className="text-lg font-semibold text-text-primary mb-1">Не удалось загрузить</h3>
      <p className="text-sm text-text-secondary mb-4">Попробуйте ещё раз</p>
      {onRetry ? (
        <Button variant="secondary" onClick={onRetry}>
          Повторить
        </Button>
      ) : null}
    </div>
  )
}

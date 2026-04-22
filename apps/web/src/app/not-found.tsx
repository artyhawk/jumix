import { Button } from '@/components/ui/button'
import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-dvh flex items-center justify-center p-4 bg-layer-0">
      <div className="max-w-sm text-center flex flex-col items-center gap-4">
        <div className="text-[64px] font-semibold text-brand-500 leading-none font-mono-numbers">
          404
        </div>
        <div className="text-text-secondary">
          Страница не найдена. Возможно, она была перемещена или удалена.
        </div>
        <Button asChild variant="secondary">
          <Link href="/">На главную</Link>
        </Button>
      </div>
    </div>
  )
}

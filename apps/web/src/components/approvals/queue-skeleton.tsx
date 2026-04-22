import { Skeleton } from '@/components/ui/skeleton'

export function QueueSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder list
          key={i}
          className="flex items-center gap-3 bg-layer-2 border border-border-subtle rounded-[10px] p-4"
        >
          <Skeleton className="size-10 rounded-full shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-48" />
            <Skeleton className="h-3 w-32" />
          </div>
          <div className="flex gap-2 shrink-0">
            <Skeleton className="h-8 w-24 rounded-[10px]" />
            <Skeleton className="h-8 w-20 rounded-[10px]" />
          </div>
        </div>
      ))}
    </div>
  )
}

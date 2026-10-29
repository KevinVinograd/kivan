import { cn } from '@/app/lib/utils'

export function FilterCountIndicator({
  count,
  className,
}: {
  count: number
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-primary-default type-caption tabular-nums fg-reverse',
        className,
      )}
    >
      {count}
    </span>
  )
}

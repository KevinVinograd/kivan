import { cn } from '@/app/lib/utils'

/**
 * Active-filter count bubble shared by every filter trigger — the text `Button`
 * shape (rendered inline after the label) and the icon `IconButton` shape
 * (positioned absolutely over the corner). A fixed 16x16 (`size-4`) circle so the
 * indicator reads identically across both shapes, regardless of the trigger's own
 * size. Single digit by construction: there are at most a handful of filter axes.
 *
 * This is the IconButton/filter count indicator that the convention
 * § 3/§ 9 names as distinct from `Badge` — Badge is sized by the `status-chrome`
 * token and cannot be pinned to 16x16 without a forbidden dimension override
 *, so the count uses this dedicated
 * indicator instead. High-emphasis solid tone: `bg-primary-default` + `fg-reverse`.
 */
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

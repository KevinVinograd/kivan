import { forwardRef, type ComponentProps, type ReactNode } from 'react'

import { cn } from '@/app/lib/utils'
import { Card, CardContent } from '@/app/components/components'

/**
 * KpiTabCard — the shared chrome for a KPI "card-as-tab". An interactive `Card` wearing the
 * Kivan lime treatment: the selected card's lime wash grows in (`bg-gradient-daytime-tab`),
 * the unselected card pins its flat surface (`bg-daytime-tab-rest`) so the alpha hover sits
 * on top instead of swapping it for ink over the page, a subtle `bg-alpha-transparent-hover`
 * overlay lifts on hover, and an inner hairline holds a consistent edge across both states.
 * It renders ONLY the chrome + a `relative` `CardContent`; the consumer supplies the
 * label/value/supporting (or custom children).
 *
 * Forwards its ref and spreads the rest of its props to the underlying `Card`, so it composes
 * as the child of a naked `TabsTrigger asChild` (the owner/admin/employee/monthly-op strips)
 * OR as a standalone `role="button"` card (the mobile pinned overlay). Density + width are the
 * consumer's: pass `compact` and a `className` (e.g. `shrink-0 max-w-40`).
 *
 * Shared PAGE-LEVEL composition (a peer of `MobileKpiStrip`), not a DS pattern: it composes
 * the governed `Card` primitive + the `bg-gradient-daytime-tab` / `bg-daytime-tab-rest`
 * utilities, adding no new tokens.
 */
export type KpiTabCardProps = Omit<
  ComponentProps<typeof Card>,
  'size' | 'interactive' | 'selected'
> & {
  /** Active item in the card group (paints the lime wash + full-contrast text). */
  selected: boolean
  /** Compact density (mobile strips): 8px inset + control radius. */
  compact?: boolean
  children: ReactNode
}

export const KpiTabCard = forwardRef<HTMLDivElement, KpiTabCardProps>(function KpiTabCard(
  { selected, compact = false, className, children, ...props },
  ref,
) {
  const radius = compact ? 'rounded-control' : 'rounded-container'
  return (
    <Card
      ref={ref}
      size={compact ? 'compact' : undefined}
      interactive
      selected={selected}
      className={cn(
        'group relative',
        selected ? 'bg-gradient-daytime-tab' : 'bg-daytime-tab-rest',
        className,
      )}
      {...props}
    >
      {/* Hover overlay — a subtle alpha-transparent lift on top of the card's own surface
          (lime wash when selected, flat surface otherwise). pointer-events-none keeps the
          trigger's click/focus. */}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-[var(--motion-duration-hover)] ease-[var(--motion-ease-out)] bg-alpha-transparent-hover group-hover:opacity-100',
          radius,
        )}
      />
      {/* Inner subtle-alpha hairline — a consistent edge across resting + selected. */}
      <span className={cn('pointer-events-none absolute inset-0 border border-alpha-subtle', radius)} aria-hidden />
      <CardContent className="relative flex h-full flex-col gap-1">{children}</CardContent>
    </Card>
  )
})

/**
 * Foreground token for KPI-tab text: full-contrast `fg-high-contrast` when selected (over the
 * lime wash), otherwise the consumer's resting class (a subtle label, a tone-colored figure…).
 */
export function kpiTabFg(selected: boolean, resting: string): string {
  return selected ? 'fg-high-contrast' : resting
}

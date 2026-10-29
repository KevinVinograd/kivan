import { forwardRef, type ComponentProps, type ReactNode } from 'react'

import { cn } from '@/app/lib/utils'
import { Card, CardContent } from '@/app/components/components'

export type KpiTabCardProps = Omit<
  ComponentProps<typeof Card>,
  'size' | 'interactive' | 'selected'
> & {
  selected: boolean
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
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-[var(--motion-duration-hover)] ease-[var(--motion-ease-out)] bg-alpha-transparent-hover group-hover:opacity-100',
          radius,
        )}
      />
      <span className={cn('pointer-events-none absolute inset-0 border border-alpha-subtle', radius)} aria-hidden />
      <CardContent className="relative flex h-full flex-col gap-1">{children}</CardContent>
    </Card>
  )
})

export function kpiTabFg(selected: boolean, resting: string): string {
  return selected ? 'fg-high-contrast' : resting
}

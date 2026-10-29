import { type ReactNode } from 'react'

import { cn } from '@/app/lib/utils'
import { AFFORDANCE } from '@/app/lib/icon-registry'
import { useKpiDensity } from '@/app/lib/use-kpi-density'
import { Card, CardContent, IconButton, Separator, Skeleton } from '@/app/components/components'

export type KpiTone = 'default' | 'success' | 'danger' | 'warning'

export const KPI_TONE_FG: Record<KpiTone, string> = {
  default: 'fg-default',
  success: 'fg-success',
  danger: 'fg-danger',
  warning: 'fg-warning',
}

function isZero(value: string): boolean {
  const digits = value.replace(/\D/g, '')
  return digits.length > 0 && !/[1-9]/.test(digits)
}

export type KpiDelta = { label: string; positive: boolean | null }

const DELTA_FG = {
  positive: 'fg-success',
  negative: 'fg-danger',
  neutral: 'fg-subtle',
} as const

function deltaClass(delta: KpiDelta): string {
  if (delta.positive === null) return DELTA_FG.neutral
  return delta.positive ? DELTA_FG.positive : DELTA_FG.negative
}

export type Kpi = {
  id: string
  label: string
  value: string
  tone?: KpiTone
  hint?: string
  delta?: KpiDelta | null
  tertiary?: boolean
}

const SUPPORTING_GRID_COLS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-2 sm:grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-4',
  5: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
  6: 'grid-cols-2 sm:grid-cols-3',
}

function supportingGridCols(count: number): string {
  return SUPPORTING_GRID_COLS[count] ?? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'
}

function KpiFigureBlock({
  kpi,
  figureToken,
  hideSubLineAtMd,
}: {
  kpi: Kpi
  figureToken: string
  hideSubLineAtMd: boolean
}) {
  const isEmptyStateProse = /\p{L}/u.test(kpi.value) && !/\d/.test(kpi.value)

  const valueClass = kpi.tertiary
    ? 'type-body-2 tabular-nums fg-subtle'
    : isEmptyStateProse
      ?
        cn('type-section tabular-nums', kpi.tone ? KPI_TONE_FG[kpi.tone] : 'fg-subtle')
      : cn(figureToken, 'tabular-nums', isZero(kpi.value) ? 'fg-subtle' : KPI_TONE_FG[kpi.tone ?? 'default'])

  return (
    <div className="flex flex-col gap-1">
      {kpi.label ? <span className="type-caption fg-subtle">{kpi.label}</span> : null}
      <span className={valueClass}>{kpi.value}</span>
      {kpi.delta ? (
        <span
          className={cn('type-caption tabular-nums', deltaClass(kpi.delta), hideSubLineAtMd && 'md:hidden')}
        >
          {kpi.delta.label}
        </span>
      ) : kpi.hint ? (
        <span className={cn('type-caption fg-subtle', hideSubLineAtMd && 'md:hidden')}>{kpi.hint}</span>
      ) : null}
    </div>
  )
}

function KpiDensityToggle({ isDense, onToggle }: { isDense: boolean; onToggle: () => void }) {
  const Icon = isDense ? AFFORDANCE.expand : AFFORDANCE.collapseValue
  return (
    <IconButton
      variant="transparent"
      size="dense"
      motion="standard"
      aria-label={isDense ? 'Expandir tarjeta' : 'Contraer tarjeta'}
      aria-expanded={!isDense}
      onClick={onToggle}
      className={cn(
        'absolute top-2 right-2 z-10 hidden md:flex',
        'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100',
      )}
    >
      <Icon aria-hidden />
    </IconButton>
  )
}

export type KpiSummaryCardProps = {
  figures: Kpi[]
  heroId?: string | [string, string] | null
  supportingToken?: 'type-metric-2' | 'type-section'
  footer?: ReactNode
  actions?: ReactNode
  dense?: boolean
  collapsible?: boolean
  storageKey?: string
  dividedHero?: boolean
}

export function KpiSummaryCard({
  figures,
  heroId,
  supportingToken = 'type-metric-2',
  footer,
  actions,
  dense = false,
  collapsible = false,
  storageKey,
  dividedHero = false,
}: KpiSummaryCardProps) {
  const { isDense, toggleDense } = useKpiDensity({ dense, storageKey })

  const heroes = ((): Kpi[] => {
    if (heroId === null) return []
    if (Array.isArray(heroId)) {
      const matched = heroId.map((id) => figures.find((figure) => figure.id === id))
      return [...new Set(matched.filter((figure): figure is Kpi => figure != null))]
    }
    const named = figures.find((figure) => figure.id === heroId) ?? figures[0]
    return named ? [named] : []
  })()
  const rest = figures.filter((figure) => !heroes.includes(figure))
  if (heroes.length === 0 && rest.length === 0) return null

  const showHeroDivider = dividedHero && heroes.length > 0 && rest.length > 0

  const heroToken = isDense ? 'type-metric md:type-metric-2' : 'type-metric'
  const restToken = isDense ? `${supportingToken} md:type-headline` : supportingToken

  return (
    <Card className={cn('relative', collapsible && 'group')}>
      {collapsible ? <KpiDensityToggle isDense={isDense} onToggle={toggleDense} /> : null}
      <CardContent
        className={cn(
          isDense &&
            'flex flex-col gap-2 md:flex-row md:flex-wrap md:items-baseline-last md:gap-x-8 md:gap-y-3',
          isDense && collapsible && 'md:pr-10',
        )}
      >
        {heroes.length > 0 ? (
          <div
            className={cn(
              heroes.length > 1 && 'grid gap-4 sm:grid-cols-2',
              heroes.length > 1 && isDense && 'md:contents',
            )}
          >
            {heroes.map((figure) => (
              <KpiFigureBlock
                key={figure.id}
                kpi={figure}
                figureToken={heroToken}
                hideSubLineAtMd={isDense}
              />
            ))}
          </div>
        ) : null}
        {showHeroDivider ? (
          <Separator className={cn(isDense && 'md:hidden')} />
        ) : null}
        {rest.length > 0 ? (
          <div className={cn('grid gap-4', supportingGridCols(rest.length), isDense && 'md:contents')}>
            {rest.map((figure) => (
              <KpiFigureBlock
                key={figure.id}
                kpi={figure}
                figureToken={restToken}
                hideSubLineAtMd={isDense}
              />
            ))}
          </div>
        ) : null}
        {footer ? <div className={cn('w-full', isDense && 'md:basis-full')}>{footer}</div> : null}
        {actions ? (
          <>
            <Separator className={cn(isDense && 'md:basis-full')} />
            <div className={cn('flex flex-wrap gap-2', isDense && 'md:basis-full')}>{actions}</div>
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}

export function KpiSummaryCardSkeleton({
  supportingCount = 3,
  heroCount = 1,
  footer = false,
  dense = false,
  storageKey,
}: {
  supportingCount?: number
  footer?: boolean
  heroCount?: 1 | 2
  dense?: boolean
  storageKey?: string
}) {
  const { isDense } = useKpiDensity({ dense, storageKey })

  return (
    <Card>
      <CardContent
        className={cn(
          isDense && 'flex flex-col gap-2 md:flex-row md:flex-wrap md:items-end md:gap-x-8 md:gap-y-3',
          isDense && 'md:pr-10',
        )}
      >
        <div
          className={cn(
            heroCount > 1 && 'grid gap-4 sm:grid-cols-2',
            heroCount > 1 && isDense && 'md:contents',
          )}
        >
          {Array.from({ length: heroCount }, (_, index) => (
            <div key={index} className="flex flex-col gap-1">
              <Skeleton className="h-4 w-28" />
              <Skeleton
                className={cn('w-48', isDense ? 'h-9 md:h-7 md:w-32 desktop:h-8' : 'h-9 md:h-11 desktop:h-15')}
              />
            </div>
          ))}
        </div>
        {supportingCount > 0 ? (
          <div
            className={cn('grid gap-4', supportingGridCols(supportingCount), isDense && 'md:contents')}
          >
            {Array.from({ length: supportingCount }, (_, index) => (
              <div key={index} className="flex flex-col gap-1">
                <Skeleton className="h-4 w-20" />
                <Skeleton className={cn('h-6 w-24', !isDense && 'md:h-7 desktop:h-10')} />
              </div>
            ))}
          </div>
        ) : null}
        {footer ? (
          <div className={cn('w-full', isDense && 'md:basis-full')}>
            <Skeleton className="h-4 w-64" />
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

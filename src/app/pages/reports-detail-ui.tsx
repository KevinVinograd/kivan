import type { ReactNode } from 'react'

import { IconButton, Card, CardContent } from '@/app/components/components'
import { SectionHeader } from '@/app/components/templates'
import { AFFORDANCE } from '@/app/lib/icon-registry'
import { useIsMobile } from '@/app/lib/use-is-mobile'
import { cn } from '@/app/lib/utils'
import { KPI_TONE_FG } from '@/app/components/patterns'
import { CohortRankingChart } from './reports-charts'
import type { CohortRanking } from './reports-aggregations'
import type { KpiTone } from './reports-format'

export function ReportDetailShell({
  title,
  subtitle,
  badges,
  onClose,
  children,
}: {
  title: string
  subtitle?: string
  badges?: ReactNode
  onClose: () => void
  children: ReactNode
}) {
  const isMobile = useIsMobile()
  const gutter = isMobile ? 'px-4' : 'px-8'
  return (
    <>
      <div className={gutter}>
        <SectionHeader
          title={title}
          description={subtitle}
          titleTrailing={badges}
          inset={false}
          actions={
            <IconButton variant="transparent" color="primary" aria-label="Cerrar detalle" onClick={onClose}>
              <AFFORDANCE.close className="size-5" aria-hidden />
            </IconButton>
          }
        />
      </div>
      <div className={cn('flex min-h-0 flex-1 flex-col gap-4 md:gap-6 overflow-y-auto pb-6', gutter)}>
        {children}
      </div>
    </>
  )
}

export function ReportDetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="type-caption fg-subtle">{title}</h3>
      <Card>
        <CardContent className="flex flex-col gap-1.5">{children}</CardContent>
      </Card>
    </section>
  )
}

export function ReportDetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="type-body-2 fg-subtle">{label}</span>
      <span className="type-body-2 fg-default tabular-nums text-right">{value}</span>
    </div>
  )
}

export type DetailFigure = {
  label: string
  value: string
  tone?: KpiTone
  emphasis?: 'hero'
}

export function ReportFiguresCard({ figures }: { figures: DetailFigure[] }) {
  return (
    <Card>
      <CardContent className="flex flex-wrap gap-6">
        {figures.map((figure) => (
          <div key={figure.label} className="flex flex-col gap-1">
            <span className="type-caption fg-subtle">{figure.label}</span>
            <span
              className={cn(
                figure.emphasis === 'hero' ? 'type-metric' : 'type-metric-2',
                'tabular-nums',
                KPI_TONE_FG[figure.tone ?? 'default'],
              )}
            >
              {figure.value}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export function ReportComparisonSection({
  title,
  ranking,
  ariaLabel,
  formatValue,
  caption,
  emptyLabel,
  footnote,
}: {
  title: string
  ranking: CohortRanking | null
  ariaLabel: string
  formatValue: (value: number) => string
  caption: string
  emptyLabel: string
  footnote?: string
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="type-caption fg-subtle">{title}</h3>
        {ranking ? (
          <span className="type-caption fg-subtle tabular-nums">
            Posición {ranking.rank} de {ranking.total}
          </span>
        ) : null}
      </div>
      <Card>
        <CardContent>
          {ranking ? (
            <div className="flex flex-col gap-2">
              <CohortRankingChart
                ranking={ranking}
                ariaLabel={ariaLabel}
                formatValue={formatValue}
              />
              <p className="type-caption fg-subtle tabular-nums">{caption}</p>
              {footnote ? <p className="type-caption fg-subtle tabular-nums">{footnote}</p> : null}
            </div>
          ) : (
            <p className="px-2 py-6 text-center type-caption fg-subtle">{emptyLabel}</p>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

export function ReportEntityLink({ name, onOpen }: { name: ReactNode; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onOpen()
      }}
      className="rounded-control text-left type-body-2 fg-default outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      {name}
    </button>
  )
}

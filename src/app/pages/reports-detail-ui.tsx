import type { ReactNode } from 'react'

import { IconButton, Card, CardContent } from '@/app/components/components'
import { SectionHeader } from '@/app/components/templates'
import { AFFORDANCE } from '@/app/lib/icon-registry'
import { useIsMobile } from '@/app/lib/use-is-mobile'
import { cn } from '@/app/lib/utils'
// KPI_TONE_FG moved to the patterns barrel with the KpiSummaryCard rollout (dev); KpiTone
// still comes from reports-format.
import { KPI_TONE_FG } from '@/app/components/patterns'
import { CohortRankingChart } from './reports-charts'
import type { CohortRanking } from './reports-aggregations'
import type { KpiTone } from './reports-format'

/**
 * Read-only detail scaffold for the report details. A pinned SectionHeader (title +
 * subtitle + status badges + close) over a scrolling body, sized for the Reportes detail
 * drawer — the only surface these details render on.
 *
 * The drawer owns its gutter rather than inheriting the page ramp: it is not a Panel, so
 * `PanelContent` / `SectionHeader inset` would fall back to the `'only'` position and
 * inset a ~480px panel by 40px a side at >=1440px. 16px on the mobile bottom sheet, 32px
 * on the tablet sheet and the desktop right drawer, matching ActivityDrawer. Header and
 * body are direct SheetContent children (it is `flex flex-col gap-4`), so the header pins
 * and the body takes the remaining height.
 *
 * Reports never edit, so this exposes navigation CTAs and read-only sections only.
 */
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

/** A labelled detail section: caption heading over a card of rows. */
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

/** One label/value row inside a detail section. */
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
  /** The detail panel's one focal figure (§6) → `type-metric` (52px); the companion
   *  steps to the Supporting-KPI tier `type-metric-2` (32px). Each panel is its own
   *  viewport, so exactly one figure is the hero. */
  emphasis?: 'hero'
}

/** Prominent figures card (e.g. Margen / Rentabilidad) at the top of a detail. The
 *  `emphasis: 'hero'` figure leads; `flex-wrap` lets the hero and its companion stack
 *  in a narrow side panel. */
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

/**
 * "How does this one compare to the rest?" — the section every entity drawer carries.
 *
 * A cohort of one is not a comparison: when `ranking` is null (no peers, or the
 * entity dropped out of the período), the chart is replaced by a plain line rather
 * than a lone bar with a median drawn through it.
 */
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

/**
 * Inline trigger for a report entity (client / person / financial record) inside a table
 * cell. Plain text with a focus affordance; the click opens the entity's drawer. It is a
 * plain button — no ref forwarding — because there is no Radix `asChild` trigger to attach
 * to any more: the drawer is controlled by `?open=`, not by a trigger.
 *
 * It is also THE KEYBOARD PATH into a report table. `TableRow interactive` adds
 * `cursor-pointer` and nothing else — no `tabIndex`, no `role`, no `onKeyDown` (table.tsx:
 * "tables are reading surfaces, so a row NEVER moves") — so a `<tr onClick>` is reachable by
 * mouse only. Where a Reportes table row opens a drawer, this button in its first cell is how
 * a keyboard reaches it, and removing it silently strands every keyboard user.
 *
 * `stopPropagation` is not optional: in a table whose ROW also carries an onClick (the
 * Finanzas detail tables), a click on the name would otherwise fire both the button and the
 * row for one gesture. It guards itself so no call site has to remember to.
 */
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

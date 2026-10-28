import { Fragment, type ReactNode } from 'react'
import type { NavigateFunction } from 'react-router'

import { Badge } from '@/app/components/components'
import { SectionAccordionCard } from '@/app/components/templates'
import type { ReportTab } from './reports-tabs-header'
import type { OpenRef } from './reports-open-param'
import { LoadedPersonActions, RiskClientActions } from './resumen-row-actions'
import {
  capacityStatusBadge,
  formatHours,
  formatPercent,
  profitabilityStatusBadge,
} from './reports-format'
import type { ClientProfitabilityReportItem, TeamCapacityReportItem } from './reports-types'

/** Secondary figures line: middot-separated compact values. */
function SecondaryFigures({ values }: { values: string[] }) {
  return (
    <>
      {values.map((value, index) => (
        <Fragment key={index}>
          {index > 0 ? (
            <span aria-hidden className="fg-subtle">
              ·
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1 tabular-nums">{value}</span>
        </Fragment>
      ))}
    </>
  )
}

/**
 * One compact two-line row inside a Resumen mobile accordion list. Mirrors the DataTable
 * mobile card row idiom (`data-table.tsx`) so report lists read the same app-wide: the
 * WHOLE row is the target — it opens the entity — and it carries that idiom's affordances
 * (`hover:bg-alpha-subtle-hover` on the `motion-standard` cadence, a focus ring, and
 * `rounded-control` + `px-2` so the fill reads as a row instead of bleeding edge to edge).
 *
 * It previously had none of that: no hover, no focus ring, no whole-row target — the only
 * thing you could hit was the name itself. The overflow menu inside must not fall through to
 * the row, and that takes TWO guards, not one: `click` is stopped on the actions wrapper, and
 * `keydown` is ignored by the row unless the key was aimed at the row itself. A single
 * click-guard is a trap — Radix opens the menu on keydown and never fires a click, so an
 * Enter meant for the menu would bubble up and yank the drawer open behind it.
 */
function MobileListItem({
  title,
  secondary,
  badge,
  actions,
  onOpen,
}: {
  title: ReactNode
  secondary: ReactNode
  badge: ReactNode
  actions: ReactNode
  onOpen: () => void
}) {
  return (
    <li className="border-b border-alpha-subtle last:border-b-0">
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(event) => {
          // Only keys aimed at the row itself open it — see the note above on why the
          // click-guard below cannot cover the overflow menu's keyboard activation.
          if (event.target !== event.currentTarget) return
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onOpen()
          }
        }}
        // `ring-inset`: the ring draws INSIDE the row box. The `<ul>` sits flush against
        // AccordionContent's `overflow-hidden` edge (measured: 0px of headroom), so the
        // default outset ring is clipped along the top of the FIRST row — the one a keyboard
        // user reaches first. Inset costs nothing at 2px and cannot be cropped.
        className="motion-standard flex cursor-pointer items-start justify-between gap-3 rounded-control px-2 py-3 outline-none hover:bg-alpha-subtle-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="min-w-0 type-body-2 font-medium fg-default">{title}</div>
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 type-caption fg-subtle">
            {secondary}
            {badge ? <span className="ms-auto inline-flex items-center">{badge}</span> : null}
          </div>
        </div>
        {/* The row is the target, so the overflow menu must not fall through to it. */}
        <div className="shrink-0" onClick={(event) => event.stopPropagation()}>
          {actions}
        </div>
      </div>
    </li>
  )
}

/**
 * Phone (`<768px`) rendering of the two Resumen summary tables: ONE
 * `SectionAccordionCard` per section (independent, both closed by default) so the
 * two lists do not stack into a long scroll. Each row is a compact two-line card;
 * the entity name opens that entity's drawer and the overflow actions are reused
 * from the desktop tables.
 *
 * The card boundary matches the desktop branch (`ResumenTab` renders the same
 * `SectionAccordionCard` per section): both breakpoints show TWO cards. This file
 * exists only because the ROWS differ — phone rows are two-line cards, desktop rows
 * are table rows — not because the card structure does. The collapsed `summary` is
 * intentionally NOT passed here: on a 390px trigger the title, the count badge and
 * the chevron compete for the same line and the title truncates first.
 *
 * The drawer itself is rendered by `ResumenTab` outside the mobile branch — the Sheet
 * resolves to a bottom sheet below 1024px on its own, so this list only reports the
 * selection upwards through `onSelect`.
 */
export function ResumenMobileLists({
  risk,
  loaded,
  showProfitability,
  onSelect,
  onTabChange,
  navigate,
}: {
  risk: ClientProfitabilityReportItem[]
  loaded: TeamCapacityReportItem[]
  showProfitability: boolean
  onSelect: (ref: OpenRef) => void
  onTabChange: (tab: ReportTab) => void
  navigate: NavigateFunction
}) {
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <SectionAccordionCard value="risk" title="Clientes con riesgo">
        <ul className="flex flex-col">
          {risk.map((client) => {
            const badge = profitabilityStatusBadge(client.status)
            return (
              <MobileListItem
                key={client.clientId}
                // Plain text, not a `ReportEntityLink`: the ROW is the target now, and a
                // nested button inside a `role="button"` row is an invalid interactive nest.
                title={client.clientName}
                onOpen={() => onSelect({ kind: 'client', id: client.clientId })}
                secondary={
                  <SecondaryFigures
                    values={[
                      ...(showProfitability ? [formatPercent(client.margen)] : []),
                      formatHours(client.horas),
                    ]}
                  />
                }
                badge={<Badge variant={badge.variant}>{badge.label}</Badge>}
                actions={
                  <RiskClientActions
                    client={client}
                    onTabChange={onTabChange}
                    navigate={navigate}
                  />
                }
              />
            )
          })}
        </ul>
      </SectionAccordionCard>

      <SectionAccordionCard value="loaded" title="Equipo con mayor carga">
        <ul className="flex flex-col">
          {loaded.map((person) => {
            const badge = capacityStatusBadge(person.status)
            return (
              <MobileListItem
                key={person.personId}
                title={person.personName}
                onOpen={() => onSelect({ kind: 'person', id: person.personId })}
                secondary={
                  <SecondaryFigures
                    values={[formatHours(person.hoursLogged), `${person.clientsActive} clientes`]}
                  />
                }
                badge={<Badge variant={badge.variant}>{badge.label}</Badge>}
                actions={
                  <LoadedPersonActions
                    person={person}
                    onTabChange={onTabChange}
                    navigate={navigate}
                  />
                }
              />
            )
          })}
        </ul>
      </SectionAccordionCard>
    </div>
  )
}

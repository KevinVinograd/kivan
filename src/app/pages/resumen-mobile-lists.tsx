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
          if (event.target !== event.currentTarget) return
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onOpen()
          }
        }}
        className="motion-standard flex cursor-pointer items-start justify-between gap-3 rounded-control px-2 py-3 outline-none hover:bg-alpha-subtle-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="min-w-0 type-body-2 font-medium fg-default">{title}</div>
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 type-caption fg-subtle">
            {secondary}
            {badge ? <span className="ms-auto inline-flex items-center">{badge}</span> : null}
          </div>
        </div>
        <div className="shrink-0" onClick={(event) => event.stopPropagation()}>
          {actions}
        </div>
      </div>
    </li>
  )
}

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

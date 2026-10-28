import { type ReactNode } from 'react'
import { useNavigate } from 'react-router'

import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/app/components/components'
import { AiInsight, KpiSummaryCard, type Kpi } from '@/app/components/patterns'
import { SectionAccordionCard } from '@/app/components/templates'
import { useIsMobile } from '@/app/lib/use-is-mobile'
import { hasCapability, type Capability } from '@hold/shared'
import { ReportsTabsHeader, type ReportTab } from './reports-tabs-header'
// Two migrations land together here. From dev: the KPI strip is now `KpiSummaryCard`
// (imported above), so `ReportKpiGrid` is gone. From this branch: an entity name opens its
// drawer, so the hover-preview links are gone.
import { ReportEntityLink } from './reports-detail-ui'
import { ReportsDetailDrawer } from './reports-detail-drawer'
import { PersonDetail } from './person-detail'
import { ClientDetail } from './client-detail'
import type { OpenRef } from './reports-open-param'
import { ResumenMobileLists } from './resumen-mobile-lists'
import { LoadedPersonActions, RiskClientActions } from './resumen-row-actions'
import {
  loadCardSummary,
  riskCardSummary,
  riskClients,
  summaryInsight,
  summaryMetrics,
  topLoadedTeam,
  type ResumenCardSummary,
} from './reports-aggregations'
import {
  capacityStatusBadge,
  formatCompactCurrency,
  formatCurrency,
  formatDeltaPercent,
  formatHours,
  formatPercent,
  formatRelativeDate,
  profitabilityStatusBadge,
  NO_VALUE,
  type KpiTone,
} from './reports-format'
import type { MetricDelta, ReportDataset } from './reports-types'
import { useReportsSummary, type LiveReportsSummary } from './reports-summary-data'

const METRIC_LABEL: Record<string, string> = {
  ingresos: 'Ingresos del período',
  egresos: 'Egresos del período',
  rentabilidad: 'Rentabilidad estimada',
  horasCargadas: 'Horas cargadas',
  clientesActivos: 'Clientes activos',
  extras: 'Extras fuera de scope',
}

/** Whether a rising metric is good (true), bad (false) or neutral (null). */
const HIGHER_IS_BETTER: Record<string, boolean | null> = {
  ingresos: true,
  egresos: false,
  rentabilidad: true,
  horasCargadas: null,
  clientesActivos: true,
  extras: false,
}

function deltaPositive(id: string, delta: MetricDelta | null): boolean | null {
  // `percent === null` means there is no comparison to make — the previous period was zero,
  // so a ratio does not exist. It used to fall through to the `absolute` sign, which tinted
  // "Sin dato anterior" GREEN off `current - 0 > 0`: a gain claimed against a month we know
  // nothing about. `formatDeltaPercent` and `deltaTone` both already bail on this; this one
  // did not, and the inconsistency only mattered rarely while most months had no previous
  // period at all. Now every month has one, and empty ones are common.
  if (!delta || delta.percent === null || delta.absolute === 0) return null
  const higherBetter = HIGHER_IS_BETTER[id]
  if (higherBetter === null) return null
  return delta.absolute > 0 === higherBetter
}

function formatMetricValue(id: string, value: number): string {
  if (id === 'ingresos' || id === 'egresos' || id === 'rentabilidad') return formatCompactCurrency(value)
  if (id === 'horasCargadas') return formatHours(value)
  return String(value)
}

function buildKpis(dataset: ReportDataset, previous: ReportDataset | null): Kpi[] {
  return summaryMetrics(dataset, previous).map((metric) => {
    const value = formatMetricValue(metric.id, metric.value)
    const tone =
      metric.id === 'rentabilidad' ? (metric.value >= 0 ? 'success' : 'danger') : 'default'
    // "vs. anterior" is only appended to an actual comparison. Without the guard the
    // no-comparison case rendered "Sin dato anterior vs. anterior", which is not a sentence.
    const delta = metric.delta
      ? {
          label:
            metric.delta.percent === null
              ? formatDeltaPercent(metric.delta)
              : `${formatDeltaPercent(metric.delta)} vs. anterior`,
          positive: deltaPositive(metric.id, metric.delta),
        }
      : null
    const hint =
      metric.id === 'extras' && !delta
        ? formatCurrency(dataset.summary.extrasFueraScopeAmount)
        : undefined
    return { id: metric.id, label: METRIC_LABEL[metric.id], value, tone, delta, hint }
  })
}

const MONEY_METRIC_IDS = new Set(['ingresos', 'egresos', 'rentabilidad'])

/**
 * Overlay the live `/reports/summary` money figures onto the owner's Resumen money
 * KPIs (Ingresos / Egresos / Rentabilidad). While the query resolves the tiles read
 * a placeholder; on error they read `NO_VALUE` with a hint. The operational KPIs
 * (horas, clientes, extras) stay mock-derived, and the compare delta drops on the
 * live tiles (single-period fetch; period-over-period is a follow-up).
 */
function applyLiveMoney(kpis: Kpi[], live: LiveReportsSummary): Kpi[] {
  return kpis.map((kpi) => {
    if (!MONEY_METRIC_IDS.has(kpi.id)) return kpi
    if (live.isError) return { ...kpi, value: NO_VALUE, tone: 'default', delta: null, hint: 'Sin conexión' }
    if (!live.money) return { ...kpi, value: '…', tone: 'default', delta: null, hint: 'Cargando' }
    const amount =
      kpi.id === 'ingresos'
        ? live.money.ingresos
        : kpi.id === 'egresos'
          ? live.money.egresos
          : live.money.rentabilidad
    const tone: KpiTone = kpi.id === 'rentabilidad' ? (amount >= 0 ? 'success' : 'danger') : 'default'
    return {
      ...kpi,
      value: formatCompactCurrency(amount),
      tone,
      delta: null,
      hint: 'En vivo',
    }
  })
}

/**
 * The lane omission, as its own FIGURE rather than a clause inside the "En vivo" hint.
 *
 * `KpiSummaryCard`'s density toggle drops hint sub-lines and PERSISTS that choice in
 * localStorage, so a card left collapsed would state three peso totals and say nothing
 * about the operations they exclude. `tertiary` keeps it reading as a note rather than a
 * fourth money KPI.
 *
 * A COUNT is still right HERE, and the reasoning is no longer the one `pagosKpis` and
 * `cobrosKpis` use — those two stopped carrying a lane figure at all and moved the
 * omission into a second card holding a real per-lane TOTAL, because an operator working
 * that month can act on an amount and cannot act on a count. This tab aggregates across
 * months and clients, where no single lane total exists to show; naming how much is
 * excluded is the count's job and a card would have nothing to put in it.
 *
 * It also stops the count being ATTRIBUTED to figures it does not describe: appended to
 * every money tile's hint, the same number appeared three times, once under a figure
 * ("Rentabilidad") that is a subtraction rather than a set of rows.
 */
function laneNoteKpi(live: LiveReportsSummary): Kpi | null {
  // `money` survives a failed REFETCH — react-query keeps the previous data and raises
  // `isError` beside it — so without this the note would state a stale count next to
  // money tiles that had already blanked to "Sin conexión" (SE001: never render a store's
  // figures while its fetch is in error).
  if (live.isError || live.isLoading) return null
  if (!live.money || live.money.otherLaneCount <= 0) return null
  return {
    id: 'otherLane',
    label: 'En otra moneda',
    value: String(live.money.otherLaneCount),
    tertiary: true,
  }
}

/**
 * One stacked Resumen disclosure card (≥md): a full-width accordion closed by
 * default whose header carries the section title plus a count badge and the
 * collapsed severity summary, revealing the detail table on open. Stacking the
 * two cards vertically gives each many-column table the full page width that the
 * prior side-by-side layout could not. Each card is its own single-item
 * `collapsible` accordion, so both can stay open (or closed) independently.
 */
function ResumenDisclosureCard({
  value,
  title,
  summary,
  children,
}: {
  value: string
  title: string
  summary: ResumenCardSummary
  children: ReactNode
}) {
  // Avoid repeating the count: when the leading signal already opens with it
  // (e.g. every at-risk client is a loss → "6 con pérdida"), drop the chip and
  // let the text carry the number; otherwise the chip states the total.
  const [leadSignal] = summary.signals
  const showCountBadge = leadSignal === undefined || !leadSignal.startsWith(`${summary.count} `)
  return (
    <SectionAccordionCard
      value={value}
      title={title}
      summary={
        <span className="flex items-center gap-2 fg-subtle">
          {showCountBadge ? <Badge variant="neutral">{summary.count}</Badge> : null}
          {summary.signals.length > 0 ? (
            <span className="type-body-2">{summary.signals.join(' · ')}</span>
          ) : null}
        </span>
      }
    >
      {children}
    </SectionAccordionCard>
  )
}

/** Resumen tab (§1): headline KPIs with compare deltas, an insight summary, and
 *  two read-only tables (clients at risk, most-loaded team). On phones the two
 *  tables become a single closed-by-default accordion of card-lists; from md up
 *  each becomes a full-width closed-by-default disclosure card stacked vertically. */
export function ResumenTab({
  dataset,
  previousDataset,
  capabilities,
  selectedRef,
  onSelect,
  onClose,
  activeTab,
  onTabChange,
}: {
  dataset: ReportDataset
  previousDataset: ReportDataset | null
  capabilities: Capability[]
  selectedRef: OpenRef | null
  onSelect: (ref: OpenRef) => void
  onClose: () => void
  activeTab: ReportTab
  onTabChange: (tab: ReportTab) => void
}) {
  const navigate = useNavigate()
  const isMobile = useIsMobile()
  // The money band needs the `studioFinancials` capability; a role without it sees the
  // operational KPIs but not the studio P&L. F6 extends the prior per-client gate
  // to the period totals and the narrative: admin loses the Ingresos/Egresos del
  // período and Rentabilidad KPI tiles, the per-client margin column, the rentabilidad
  // lead sentence in the insight, and the "ver rentabilidad" CTA (that tab is also
  // hidden for admin), keeping only the operational signals.
  const showProfitability = hasCapability(capabilities, 'studioFinancials')
  // The three money KPIs come from the real `/reports/summary` endpoint (manager-only,
  // matching the in-page money gate); the operational KPIs stay mock-derived.
  const live = useReportsSummary(dataset.period, showProfitability)
  const moneyKpis = applyLiveMoney(
    buildKpis(dataset, previousDataset).filter(
      (kpi) => showProfitability || !['ingresos', 'egresos', 'rentabilidad'].includes(kpi.id),
    ),
    live,
  )
  // Only where the money figures are actually shown: with no financials capability there
  // is no peso total on screen for the note to qualify.
  const laneNote = showProfitability ? laneNoteKpi(live) : null
  const kpis = laneNote ? [...moneyKpis, laneNote] : moneyKpis
  const insight = summaryInsight(dataset, previousDataset, showProfitability)
  const risk = riskClients(dataset.profitability).slice(0, 6)
  const loaded = topLoadedTeam(dataset.capacity).slice(0, 6)
  // Resumen shows a slice (top 6) of each table, but the drawer resolves against the FULL
  // dataset: the cohort a record is compared to is the whole period, not the six rows the
  // card happened to show.
  const selectedClient =
    selectedRef?.kind === 'client'
      ? (dataset.profitability.find((client) => client.clientId === selectedRef.id) ?? null)
      : null
  const selectedPerson =
    selectedRef?.kind === 'person'
      ? (dataset.capacity.find((person) => person.personId === selectedRef.id) ?? null)
      : null
  const selectedPersonProductivity = selectedPerson
    ? dataset.productivity.filter((row) => row.personId === selectedPerson.personId)
    : []

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <ReportsTabsHeader activeTab={activeTab} onTabChange={onTabChange} />
      {/* §6 Resumen focal: owner → Rentabilidad estimada; admin (money tiles removed)
          → the first operational KPI. That tile becomes the tab's type-metric hero. */}
      <div className="px-4 md:px-6 lg:px-8 desktop:px-10">
        <KpiSummaryCard
          figures={kpis}
          heroId={showProfitability ? 'rentabilidad' : kpis[0]?.id}
          collapsible
          storageKey="reports-resumen"
        />
      </div>

      {insight ? (
        <div className="px-4 md:px-6 lg:px-8 desktop:px-10">
          <AiInsight
            variant="prominent"
            overline="Resumen del período"
            headline={insight}
            ctaLabel={showProfitability ? 'Ver rentabilidad' : undefined}
            onCta={showProfitability ? () => onTabChange('rentabilidad') : undefined}
          />
        </div>
      ) : null}

      <div className="px-4 md:px-6 lg:px-8 desktop:px-10">
        {isMobile ? (
          <ResumenMobileLists
            risk={risk}
            loaded={loaded}
            showProfitability={showProfitability}
            onSelect={onSelect}
            onTabChange={onTabChange}
            navigate={navigate}
          />
        ) : (
          <div className="flex flex-col gap-4 md:gap-6">
            <ResumenDisclosureCard
              value="risk"
              title="Clientes con riesgo"
              summary={riskCardSummary(risk, showProfitability)}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cliente</TableHead>
                    {showProfitability ? <TableHead>Rentabilidad</TableHead> : null}
                    <TableHead>Horas</TableHead>
                    <TableHead>Último aumento</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>
                      <span className="sr-only">Acciones</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {risk.map((client) => {
                    const badge = profitabilityStatusBadge(client.status)
                    return (
                      <TableRow key={client.clientId}>
                        <TableCell>
                          <ReportEntityLink
                            name={client.clientName}
                            onOpen={() => onSelect({ kind: 'client', id: client.clientId })}
                          />
                        </TableCell>
                        {showProfitability ? (
                          <TableCell className="tabular-nums fg-default">{formatPercent(client.margen)}</TableCell>
                        ) : null}
                        <TableCell className="tabular-nums fg-default">{formatHours(client.horas)}</TableCell>
                        <TableCell className="type-body-2 fg-subtle">
                          {formatRelativeDate(client.lastIncreaseDate)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <RiskClientActions
                            client={client}
                            onTabChange={onTabChange}
                            navigate={navigate}
                          />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </ResumenDisclosureCard>

            <ResumenDisclosureCard
              value="loaded"
              title="Equipo con mayor carga"
              summary={loadCardSummary(loaded)}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Persona</TableHead>
                    <TableHead>Horas cargadas</TableHead>
                    <TableHead>Clientes activos</TableHead>
                    <TableHead>Capacidad estimada</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead>
                      <span className="sr-only">Acciones</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loaded.map((person) => {
                    const badge = capacityStatusBadge(person.status)
                    return (
                      <TableRow key={person.personId}>
                        <TableCell>
                          <ReportEntityLink
                            name={person.personName}
                            onOpen={() => onSelect({ kind: 'person', id: person.personId })}
                          />
                        </TableCell>
                        <TableCell className="tabular-nums fg-default">{formatHours(person.hoursLogged)}</TableCell>
                        <TableCell className="tabular-nums fg-default">{person.clientsActive}</TableCell>
                        <TableCell className="tabular-nums fg-default">{formatHours(person.capacity)}</TableCell>
                        <TableCell>
                          <Badge variant={badge.variant}>{badge.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <LoadedPersonActions
                            person={person}
                            onTabChange={onTabChange}
                            navigate={navigate}
                          />
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </ResumenDisclosureCard>
          </div>
        )}
      </div>

      <ReportsDetailDrawer
        title={selectedClient?.clientName ?? selectedPerson?.personName ?? 'Detalle'}
        detail={
          selectedClient ? (
            <ClientDetail item={selectedClient} cohort={dataset.profitability} onClose={onClose} />
          ) : selectedPerson ? (
            <PersonDetail
              item={selectedPerson}
              cohort={dataset.capacity}
              productivity={selectedPersonProductivity}
              allProductivity={dataset.productivity}
              onClose={onClose}
            />
          ) : null
        }
        onClose={onClose}
      />
    </div>
  )
}

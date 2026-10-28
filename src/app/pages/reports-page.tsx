import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'

import { PageHeader, PageContent } from '@/app/components/templates'
import { TooltipProvider, toast } from '@/app/components/components'
import { AFFORDANCE } from '@/app/lib/icon-registry'
import { trailToHere } from '@/app/lib/nav-trail'
import { hasCapability } from '@hold/shared'
import { useRole } from '@/app/lib/use-role'
import { TrailBreadcrumb } from './trail-breadcrumb'
import { ReportsPeriodControls } from './reports-filters'
import { readPeriodParam } from '@/app/lib/periods'
import { ReportsTabsHeader, isReportTabAllowed, type ReportTab } from './reports-tabs-header'
import { ReportsEmptyPeriod, ReportsError, ReportsLoading } from './reports-states'
import { getReportData } from './reports-data'
import { exportReportCsv } from './reports-export'
import {
  useReportsCapacity,
  useReportsMarginHistory,
  useReportsProductivity,
  useReportsProfitability,
} from './reports-api-data'
import { readOpenRef, withOpenRef, withoutOpenRef, type OpenRef } from './reports-open-param'
import {
  currentReportPeriod,
  reportPeriods,
  previousReportPeriod,
  type ReportPeriod,
} from './reports-periods'
import { ResumenTab } from './resumen-tab'
import { ProductividadTab } from './productividad-tab'
import { RentabilidadTab } from './rentabilidad-tab'
import { CargaEquipoTab } from './carga-equipo-tab'
import { FinanzasTab } from './finanzas-tab'
import { useReceivables } from './receivables-data'
import { usePayments } from './payments-data'

type LoadStatus = 'loading' | 'ready' | 'error'

/** Valid Reportes tabs, for parsing the `?tab=` deep-link param. */
const REPORT_TAB_VALUES: ReportTab[] = ['resumen', 'productividad', 'rentabilidad', 'carga', 'finanzas']

/** Parse a raw `?tab=` value into a `ReportTab`, or `null` when it is not one. */
function parseReportTab(value: string | null): ReportTab | null {
  return value != null && (REPORT_TAB_VALUES as string[]).includes(value) ? (value as ReportTab) : null
}

/**
 * Reportes — the read-only analytics page (route `/reports`). It owns the load
 * status, the selected período (§6) and the drill-in drawer's `?open=` state. All
 * figures come from `reports-data`, derived from existing Clients / Team / Operación
 * mensual / Cobranza mock. The page header (with the período controls) stays mounted
 * across every tab and selection.
 *
 * Productividad, Rentabilidad and Carga de equipo all drill into a record through the
 * same read-only drawer (`reports-detail-drawer`): a right-side panel from 1024px, a
 * bottom sheet below. The page behind it — tab strip, KPIs, charts, table — stays put,
 * which is the point on an analytics surface where the record is read AGAINST that
 * aggregate. Selection lives in `?open=` (see `reports-open-param`), so a detail is
 * shareable, survives a reload, and closes on browser Back.
 *
 * Nothing here mutates data.
 */
function ReportsPageInner() {
  const { role, capabilities, canDo } = useRole()
  // Reportes reads BOTH the receivables and the payments store, and every report on this page
  // is computed from the two together — so both must gate it. This page used to take only
  // `receivables` and fake its load state with a `setTimeout(400)`; that was fixed, but only
  // for receivables, and the note left behind said payments' flags would fold in "once it is
  // migrated" to react-query. That was never the blocker: `payments-data` exposes
  // `isLoading` / `isError` / `refetch` today regardless of how it fetches. Until now a failed
  // `GET /payments` left every egreso at zero and reported the page as ready.
  const { receivables, isFetching, isError, refetch } = useReceivables()
  const {
    payments,
    isLoading: paymentsLoading,
    isError: paymentsError,
    refetch: refetchPayments,
  } = usePayments()
  const [searchParams, setSearchParams] = useSearchParams()
  // The active tab is URL-addressable (?tab=) so dashboards can deep-link to a specific
  // report. It is DERIVED from the URL on every render rather than latched at mount:
  // opening a record now pushes a history entry, so Back/Forward can change ?tab= without
  // remounting the page, and a latched tab would keep rendering one tab while the URL named
  // another — after which the next ?open= push would write a tab/open pair that disagree.
  // An unknown or capability-blocked tab falls back to Resumen.
  const requestedTab = parseReportTab(searchParams.get('tab'))
  const effectiveTab: ReportTab =
    requestedTab && isReportTabAllowed(requestedTab, capabilities) ? requestedTab : 'resumen'
  // The período lives in the URL, alongside `?tab=` and `?open=`.
  //
  // It was React state only, and `?open=` is validated against the SELECTED period's dataset
  // (`readOpenRef`) — so a link to a record from any month but the current one resolved
  // against the wrong dataset on load, found nothing, and opened no drawer. Silently: the
  // reader got the page with no detail and no reason why. That made `?open=`'s own promise
  // ("shareable, reload-safe") true only for the current month, and it went unnoticed because
  // the seed today only carries June records — the moment a May receivable exists, every
  // shared link to it is dead. Four drawer kinds already lived under that contract before this
  // branch added a fifth; the URL now carries what the contract always needed.
  //
  // The default month is omitted from the URL, so `/reports` stays clean and "no `?period=`"
  // means "the current one".
  const requestedPeriod = searchParams.get('period')
  const [selectedPeriod, setSelectedPeriod] = useState<ReportPeriod>(
    // Normalized, not merely validated — see `readPeriodParam`. Checking against the frozen
    // three-month array made a ?period= link to any other month fall back to the default.
    readPeriodParam(requestedPeriod) ?? currentReportPeriod(),
  )
  const navigate = useNavigate()
  // Opening a record pushes a history entry, so browser Back closes the drawer. A drawer
  // that arrived from a deep-link has no entry of OURS to pop, so it closes with a
  // replace instead — otherwise Back would leave the page entirely.
  const openedByPushRef = useRef(false)

  const previousPeriod = previousReportPeriod(selectedPeriod)
  // Unioned with the periods the loaded rows carry, like every other selector: a receivable
  // older than the rolling window is still reportable, and leaving its month off the list
  // would hide a period that has data. Memoized so the Select is not handed a new array
  // identity on every render.
  const periods = useMemo(
    () => reportPeriods([...receivables.map((r) => r.period), ...payments.map((p) => p.period)]),
    [receivables, payments],
  )

  // profitability needs the `profitability` capability (the Rentabilidad tab); capacity is
  // owner+admin (the Carga de equipo tab, with per-member cost gated by `teamCost`
  // server-side). Only fire each for a role that can open its tab, so no request ever 403s.
  const canSeeProfitability = hasCapability(capabilities, 'profitability')
  const canSeeCapacity = role === 'owner' || role === 'admin'
  // Productividad (logged hours) is owner+admin, like capacity — hours, not money.
  const canSeeProductivity = role === 'owner' || role === 'admin'
  const profitability = useReportsProfitability(selectedPeriod, canSeeProfitability)
  const prevProfitability = useReportsProfitability(
    previousPeriod,
    canSeeProfitability,
  )
  const capacity = useReportsCapacity(canSeeCapacity)
  const productivity = useReportsProductivity(selectedPeriod, canSeeProductivity)
  const prevProductivity = useReportsProductivity(previousPeriod, canSeeProductivity)
  // Margin trend (last 6 months) — needs `profitability`, same as the tab it renders on.
  const marginHistoryQuery = useReportsMarginHistory(canSeeProfitability)
  const marginHistory = marginHistoryQuery.data

  // Every async source the page renders from, in ONE list. Status and "Reintentar" both walk
  // it, so adding a query is a single edit — the same set used to be spelled out three times
  // (loading, error, retry) and had already drifted: the previous-period comparisons were
  // missing from the loading arm, so the deltas rendered as zero while still in flight.
  // Each store is read by name rather than spread in: SE001 verifies a screen consumes
  // every store's `isError`, and it can only see the reads it can name.
  const sources: { isLoading: boolean; isError: boolean; refetch: () => unknown }[] = [
    { isLoading: isFetching, isError, refetch },
    { isLoading: paymentsLoading, isError: paymentsError, refetch: refetchPayments },
    { isLoading: profitability.isLoading, isError: profitability.isError, refetch: profitability.refetch },
    { isLoading: prevProfitability.isLoading, isError: prevProfitability.isError, refetch: prevProfitability.refetch },
    { isLoading: capacity.isLoading, isError: capacity.isError, refetch: capacity.refetch },
    { isLoading: productivity.isLoading, isError: productivity.isError, refetch: productivity.refetch },
    { isLoading: prevProductivity.isLoading, isError: prevProductivity.isError, refetch: prevProductivity.refetch },
    { isLoading: marginHistoryQuery.isLoading, isError: marginHistoryQuery.isError, refetch: marginHistoryQuery.refetch },
  ]
  // Loading FIRST: the initial load and a "Reintentar" refetch both show the skeleton.
  // react-query keeps `isError` true during a refetch, so checking error first would freeze the
  // error screen and make the retry look inert. Same derivation as cobranza-page.
  // Fail as a unit: this page's figures come from ALL of receivables, payments and the
  // capability-gated profitability/capacity aggregates, so any one failing means the page failed
  // (an empty array on error would otherwise read as real zeroes). Loading gates the same set.
  const status: LoadStatus = sources.some((s) => s.isLoading)
    ? 'loading'
    : sources.some((s) => s.isError)
      ? 'error'
      : 'ready'
  // Retry everything, not just the one the reader can name. A retry that refetches half the
  // page is how a "Reintentar" button ends up looking broken.
  const retryAll = () => {
    for (const s of sources) s.refetch()
  }

  // Records differ per period, so a period change closes any open detail AND publishes the new
  // período to the URL. The ref guard skips the mount run, so a deep-linked ?open= is not
  // stripped on first render.
  const periodRef = useRef(selectedPeriod)
  useEffect(() => {
    if (periodRef.current === selectedPeriod) return
    periodRef.current = selectedPeriod
    openedByPushRef.current = false
    setSearchParams(
      (prev) => {
        const next = withoutOpenRef(prev)
        if (selectedPeriod === currentReportPeriod()) next.delete('period')
        else next.set('period', selectedPeriod)
        return next
      },
      { replace: true },
    )
  }, [selectedPeriod, setSearchParams])

  const dataset = useMemo(
    () =>
      getReportData(selectedPeriod, {
        receivables,
        payments,
        profitability: profitability.data,
        otherLaneClientCount: profitability.otherLaneClientCount,
        unbilledCost: profitability.unbilledCost,
        capacity: capacity.data,
        productivity: productivity.data,
      }),
    [
      selectedPeriod,
      receivables,
      payments,
      profitability.data,
      profitability.otherLaneClientCount,
      profitability.unbilledCost,
      capacity.data,
      productivity.data,
    ],
  )
  // Comparison is always on: KPI deltas show against the previous month.
  //
  // `previousReportPeriod` now returns a real month every time (date arithmetic), where it
  // used to return null past the end of a three-item array — so on the oldest listed month
  // the comparison silently switched itself off, reading as "no prior data" when the data
  // was merely outside the array. Whether that month HAS data is the dataset's answer, not
  // the period list's: an empty prior month yields an empty comparison, which is the truth.
  const previousDataset = useMemo(
    () =>
      getReportData(previousPeriod, {
        receivables,
        payments,
        profitability: prevProfitability.data,
        capacity: capacity.data,
        productivity: prevProductivity.data,
      }),
    [
      previousPeriod,
      receivables,
      payments,
      prevProfitability.data,
      capacity.data,
      prevProductivity.data,
    ],
  )

  // Export the active tab's table to CSV (client-side, from the in-page dataset).
  const handleExport = useCallback(() => {
    const count = exportReportCsv(effectiveTab, dataset)
    if (count === 0) toast.warning('No hay datos para exportar en esta pestaña')
    else toast.success('Exportación generada')
  }, [effectiveTab, dataset])

  // Every clause is a reason the period has something to SHOW. Two were missing and each
  // produced the same lie in a different way:
  //
  //   - the money figures are PESO-scoped, so a month billed entirely in dollars or fund
  //     units scored zero on all of them, and the page replaced every tab with "Todavía no
  //     hay datos para este período" — suppressing the three lane notices that would have
  //     explained it, and telling the operator to load data already loaded;
  //   - nothing consulted the PAGOS at all, so a month whose only loaded data was outflows
  //     read as empty while the Finanzas tab held its rows;
  //   - nor the PRODUCTIVITY rows, which are the one period source that is not money at
  //     all, so a month with hours logged and nothing billed hid the Productividad tab
  //     that exists to show them.
  const hasData =
    dataset.summary.ingresos > 0 ||
    dataset.profitability.length > 0 ||
    dataset.financials.cobrosDetail.length > 0 ||
    dataset.financials.pagosDetail.length > 0 ||
    dataset.financials.gastosFijosList.length > 0 ||
    dataset.productivity.length > 0 ||
    dataset.summary.otherLaneCount > 0 ||
    dataset.otherLaneClientCount > 0

  // Switch tabs and reflect the choice in the URL (?tab=) so the view is
  // shareable and deep-linkable; drop any stale ?open= when changing tabs.
  const changeTab = useCallback(
    (tab: ReportTab) => {
      openedByPushRef.current = false
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set('tab', tab)
          next.delete('open')
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  // ?open= is the source of truth for the drawer; it is resolved against the ACTIVE
  // tab's allowed kinds and the current período's dataset on every render, so a stale
  // ref (wrong tab, wrong kind, or a record this período does not contain) simply does
  // not open.
  const openRef = readOpenRef(searchParams, effectiveTab, dataset)

  const selectRecord = useCallback(
    (ref: OpenRef) => {
      openedByPushRef.current = true
      setSearchParams((prev) => withOpenRef(prev, ref))
    },
    [setSearchParams],
  )

  const closeDetail = useCallback(() => {
    if (openedByPushRef.current) {
      openedByPushRef.current = false
      navigate(-1)
      return
    }
    setSearchParams((prev) => withoutOpenRef(prev), { replace: true })
  }, [navigate, setSearchParams])

  let body
  if (status === 'loading') {
    body = <ReportsLoading />
  } else if (status === 'error') {
    body = (
      <ReportsError
        onRetry={retryAll}
        onResetPeriod={() => setSelectedPeriod(currentReportPeriod())}
      />
    )
  } else if (!hasData) {
    body = (
      <div className="flex flex-col">
        <ReportsTabsHeader activeTab={effectiveTab} onTabChange={changeTab} />
        <ReportsEmptyPeriod />
      </div>
    )
  } else if (effectiveTab === 'resumen') {
    body = (
      <ResumenTab
        dataset={dataset}
        previousDataset={previousDataset}
        capabilities={capabilities}
        selectedRef={openRef}
        onSelect={selectRecord}
        onClose={closeDetail}
        activeTab={effectiveTab}
        onTabChange={changeTab}
      />
    )
  } else if (effectiveTab === 'productividad') {
    body = (
      <ProductividadTab
        dataset={dataset}
        selectedRef={openRef}
        onSelect={selectRecord}
        onClose={closeDetail}
        activeTab={effectiveTab}
        onTabChange={changeTab}
      />
    )
  } else if (effectiveTab === 'rentabilidad') {
    body = (
      <RentabilidadTab
        dataset={dataset}
        marginHistory={marginHistory}
        selectedRef={openRef}
        onSelect={selectRecord}
        onClose={closeDetail}
        activeTab={effectiveTab}
        onTabChange={changeTab}
      />
    )
  } else if (effectiveTab === 'carga') {
    body = (
      <CargaEquipoTab
        dataset={dataset}
        selectedRef={openRef}
        onSelect={selectRecord}
        onClose={closeDetail}
        activeTab={effectiveTab}
        onTabChange={changeTab}
      />
    )
  } else {
    body = (
      <FinanzasTab
        dataset={dataset}
        previousDataset={previousDataset}
        selectedRef={openRef}
        onSelect={selectRecord}
        onClose={closeDetail}
        activeTab={effectiveTab}
        onTabChange={changeTab}
      />
    )
  }

  // Contextual back-trail when deep-linked here (e.g. a dashboard CTA or critical
  // alert carrying a Dashboard crumb); empty for direct nav, so no breadcrumb renders.
  const trail = trailToHere(searchParams, '/reports')

  return (
    <TooltipProvider>
      <PageHeader
        eyebrow="Hold"
        eyebrowHidden
        title="Reportes"
        description="Analizá productividad, rentabilidad y carga operativa por período."
        breadcrumb={trail.length > 0 ? <TrailBreadcrumb trail={trail} leaf="Reportes" /> : undefined}
        controls={
          status === 'ready' ? (
            <ReportsPeriodControls selectedPeriod={selectedPeriod} periods={periods} onSelectPeriod={setSelectedPeriod} />
          ) : undefined
        }
        actions={
          status === 'ready' && canDo('report.export')
            ? [
                {
                  key: 'export',
                  label: 'Exportar',
                  ariaLabel: 'Exportar la pestaña actual a CSV',
                  icon: AFFORDANCE.download,
                  variant: 'outlined',
                  iconOnly: true,
                  mobileIconOnly: true,
                  primary: true,
                  tooltip: 'Exportar la pestaña actual a CSV',
                  onClick: handleExport,
                },
              ]
            : undefined
        }
      />
      <PageContent>{body}</PageContent>
    </TooltipProvider>
  )
}

export function ReportsPage() {
  return <ReportsPageInner />
}

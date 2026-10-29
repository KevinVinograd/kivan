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

const REPORT_TAB_VALUES: ReportTab[] = ['resumen', 'productividad', 'rentabilidad', 'carga', 'finanzas']

function parseReportTab(value: string | null): ReportTab | null {
  return value != null && (REPORT_TAB_VALUES as string[]).includes(value) ? (value as ReportTab) : null
}

function ReportsPageInner() {
  const { role, capabilities, canDo } = useRole()
  const { receivables, isFetching, isError, refetch } = useReceivables()
  const {
    payments,
    isLoading: paymentsLoading,
    isError: paymentsError,
    refetch: refetchPayments,
  } = usePayments()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedTab = parseReportTab(searchParams.get('tab'))
  const effectiveTab: ReportTab =
    requestedTab && isReportTabAllowed(requestedTab, capabilities) ? requestedTab : 'resumen'
  const requestedPeriod = searchParams.get('period')
  const [selectedPeriod, setSelectedPeriod] = useState<ReportPeriod>(
    readPeriodParam(requestedPeriod) ?? currentReportPeriod(),
  )
  const navigate = useNavigate()
  const openedByPushRef = useRef(false)

  const previousPeriod = previousReportPeriod(selectedPeriod)
  const periods = useMemo(
    () => reportPeriods([...receivables.map((r) => r.period), ...payments.map((p) => p.period)]),
    [receivables, payments],
  )

  const canSeeProfitability = hasCapability(capabilities, 'profitability')
  const canSeeCapacity = role === 'owner' || role === 'admin'
  const canSeeProductivity = role === 'owner' || role === 'admin'
  const profitability = useReportsProfitability(selectedPeriod, canSeeProfitability)
  const prevProfitability = useReportsProfitability(
    previousPeriod,
    canSeeProfitability,
  )
  const capacity = useReportsCapacity(canSeeCapacity)
  const productivity = useReportsProductivity(selectedPeriod, canSeeProductivity)
  const prevProductivity = useReportsProductivity(previousPeriod, canSeeProductivity)
  const marginHistoryQuery = useReportsMarginHistory(canSeeProfitability)
  const marginHistory = marginHistoryQuery.data

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
  const status: LoadStatus = sources.some((s) => s.isLoading)
    ? 'loading'
    : sources.some((s) => s.isError)
      ? 'error'
      : 'ready'
  const retryAll = () => {
    for (const s of sources) s.refetch()
  }

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

  const handleExport = useCallback(() => {
    const count = exportReportCsv(effectiveTab, dataset)
    if (count === 0) toast.warning('No hay datos para exportar en esta pestaña')
    else toast.success('Exportación generada')
  }, [effectiveTab, dataset])

  const hasData =
    dataset.summary.ingresos > 0 ||
    dataset.profitability.length > 0 ||
    dataset.financials.cobrosDetail.length > 0 ||
    dataset.financials.pagosDetail.length > 0 ||
    dataset.financials.gastosFijosList.length > 0 ||
    dataset.productivity.length > 0 ||
    dataset.summary.otherLaneCount > 0 ||
    dataset.otherLaneClientCount > 0

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

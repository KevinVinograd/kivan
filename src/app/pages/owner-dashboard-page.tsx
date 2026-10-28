import { useMemo, useState } from 'react'

import { PageHeader, PageContent, PanelGroup, Panel } from '@/app/components/templates'
import { Tabs, TabsContent } from '@/app/components/components'
import { useDaytime } from '@/app/daytime'
import { useAuth } from '@/app/lib/auth-store'
import { greetingName } from './clients-team'
import { useMonthlyOperation, useRevalidateOnOpen } from './monthly-operation-data'
import { defaultMonthId } from './monthly-operation-mock-data'
import { getDashboardData, monthIdToPeriod } from './dashboard-data'
import { getReportData } from './reports-data'
import { useReportsCapacity, useReportsProfitability } from './reports-api-data'
import { useReceivables } from './receivables-data'
import { usePayments } from './payments-data'
import { DashboardHealthSummary, type MetricId } from './dashboard-health-summary'
import { ClientRiskList } from './dashboard-client-risk'
import { CriticalAlertsList } from './dashboard-critical-alerts'
import { MonthlyOperationStatusCard } from './dashboard-monthly-operation'
import { ProfitabilitySnapshotSection } from './dashboard-profitability'
import { PendingPaymentsSummary } from './dashboard-pending-payments'
import { TeamLoadSnapshot } from './dashboard-team-load'
import { RecentActivityList } from './dashboard-activity'
import { DashboardEmptyMonth, DashboardError, DashboardLoading } from './dashboard-states'

/** Per-section empty note when a month has no data for the selected KPI's panel. */
function DashboardSectionEmpty({ label }: { label: string }) {
  return <p className="px-4 md:px-6 lg:px-8 xl:pr-5 desktop:pl-10 type-body-2 fg-subtle">No hay datos de {label} para este mes.</p>
}

/**
 * Owner Dashboard — the owner-facing operational cockpit (route `/dashboard`,
 * `owner` role variant). A read-only page whose health-KPI strip doubles as a
 * radio filter: the five cards are a naked `Tabs` group (one always active,
 * defaulting to client risk) and each owns the main-column section shown below —
 * clientes en riesgo, cobros pendientes, rentabilidad, operación mensual or carga
 * del equipo. The active card paints its semantic shader so its tendency reads
 * without a CTA. Alertas críticas sits inside the clientes en riesgo panel, so
 * it only surfaces with that KPI; a fluid secondary rail holds actividad
 * reciente, always visible under any panel.
 *
 * Every figure is derived in `dashboard-data.ts` from existing module data
 * (Reportes derivation, Clientes mock, the live Operación mensual store). The
 * month selector drives all data locally and never mutates the shared monthly
 * selection. Nothing here writes data.
 */
export function OwnerDashboardPage() {
  const op = useMonthlyOperation()
  useRevalidateOnOpen(defaultMonthId())
  const { greeting } = useDaytime()
  const { me } = useAuth()
  // Greet the real signed-in user (falls back to a neutral greeting before /auth/me resolves).
  const greetName = me ? greetingName({ name: `${me.firstName} ${me.lastName}`.trim(), firstName: me.firstName }) : ''
  // Radio filter: one KPI card is always active, defaulting to client risk.
  const [selectedSection, setSelectedSection] = useState<MetricId>('risk')

  // Pinned to the current month — the dashboard has no period selector.
  const record = useMemo(
    () => op.months.find((month) => month.id === defaultMonthId()) ?? op.months[0],
    [op.months],
  )

  // Real report inputs: the receivables/payments stores plus the capability-gated
  // profitability/capacity aggregates for this month. This is the owner page, so
  // those endpoints are always allowed; enable them once the month maps to a period.
  const { receivables, isLoading: recLoading, isError: recError, refetch: refetchRec } = useReceivables()
  const { payments, isLoading: payLoading, isError: payError, refetch: refetchPay } = usePayments()
  const period = record ? monthIdToPeriod(record.id) : null
  const profitability = useReportsProfitability(period ?? '', period != null)
  const capacity = useReportsCapacity(period != null)

  const report = useMemo(
    () =>
      period
        ? getReportData(period, {
            receivables,
            payments,
            profitability: profitability.data,
            capacity: capacity.data,
          })
        : null,
    [period, receivables, payments, profitability.data, capacity.data],
  )
  const data = useMemo(() => getDashboardData(record, report), [record, report])

  // Fail as a unit with the bundle: the dashboard's figures come from ALL of the
  // receivables/payments stores and the capability-gated profitability/capacity aggregates,
  // so any one loading holds the skeleton and any one failing shows the error state
  // (an empty array on error would otherwise read as real zeroes). Retry hits them all.
  const reportBusy = recLoading || payLoading || profitability.isLoading || capacity.isLoading
  const reportError = recError || payError || profitability.isError || capacity.isError
  const retryAll = () => {
    op.retry()
    refetchRec()
    refetchPay()
    profitability.refetch()
    capacity.refetch()
  }

  // The load state comes from the bundle fetch this page reads, not from a timer. It used to
  // be `setTimeout(() => setStatus('ready'), 400)`, which flipped to ready whether the fetch
  // had succeeded, was still in flight, or had failed — so `error` was unreachable and
  // `Reintentar` only restarted the timer. Note the empty-month branch below is NOT an error
  // branch: it means the month loaded and holds nothing, which only reads true once the fetch
  // actually resolved.
  let body
  if (op.loadStatus === 'loading' || reportBusy) {
    body = <DashboardLoading />
  } else if (op.loadStatus === 'error' || reportError) {
    body = <DashboardError onRetry={retryAll} />
  } else if (!data.hasData) {
    body = <DashboardEmptyMonth />
  } else {
    body = (
      <Tabs
        value={selectedSection}
        onValueChange={(value) => setSelectedSection(value as MetricId)}
        className="gap-4 md:gap-6"
      >
        <DashboardHealthSummary kpis={data.kpis} selectedId={selectedSection} onSelect={setSelectedSection} />
        {/* inlineAt="xl": Actividad reciente (aside) stacks below Clientes en riesgo on
            laptops (<1280px) where a fill + aside split is too cramped, splitting into
            two columns only at xl+. */}
        <PanelGroup layout="inline" inlineAt="xl">
          {/* Main column: the KPI-selected operational panel. */}
          <Panel type="fill">
            <TabsContent value="risk" className="flex flex-col gap-4 md:gap-6">
              <ClientRiskList risks={data.risks} />
              <CriticalAlertsList alerts={data.alerts} />
            </TabsContent>
            <TabsContent value="income">
              {data.payments ? (
                <PendingPaymentsSummary payments={data.payments} />
              ) : (
                <DashboardSectionEmpty label="cobros pendientes" />
              )}
            </TabsContent>
            <TabsContent value="margin">
              {data.profitability ? (
                <ProfitabilitySnapshotSection snapshot={data.profitability} />
              ) : (
                <DashboardSectionEmpty label="rentabilidad" />
              )}
            </TabsContent>
            <TabsContent value="operation">
              <MonthlyOperationStatusCard operation={data.operation} />
            </TabsContent>
            <TabsContent value="overload">
              {data.teamLoad ? (
                <TeamLoadSnapshot teamLoad={data.teamLoad} />
              ) : (
                <DashboardSectionEmpty label="carga del equipo" />
              )}
            </TabsContent>
          </Panel>
          {/* Secondary rail: always-on actividad reciente, independent of the
              active KPI. Alertas críticas now lives inside the Clientes en
              riesgo panel, surfaced only with that KPI. */}
          <Panel type="aside">
            <RecentActivityList activity={data.activity} previews={data.activityPreviews} />
          </Panel>
        </PanelGroup>
      </Tabs>
    )
  }

  return (
    <>
      <PageHeader
        eyebrow="Hold"
        eyebrowHidden
        title={greetName ? `${greeting}, ${greetName}` : greeting}
        subtitle={record?.label ? { variant: 'badge', value: record.label } : undefined}
      />
      <PageContent>{body}</PageContent>
    </>
  )
}

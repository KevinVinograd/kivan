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

function DashboardSectionEmpty({ label }: { label: string }) {
  return <p className="px-4 md:px-6 lg:px-8 xl:pr-5 desktop:pl-10 type-body-2 fg-subtle">No hay datos de {label} para este mes.</p>
}

export function OwnerDashboardPage() {
  const op = useMonthlyOperation()
  useRevalidateOnOpen(defaultMonthId())
  const { greeting } = useDaytime()
  const { me } = useAuth()
  const greetName = me ? greetingName({ name: `${me.firstName} ${me.lastName}`.trim(), firstName: me.firstName }) : ''
  const [selectedSection, setSelectedSection] = useState<MetricId>('risk')

  const record = useMemo(
    () => op.months.find((month) => month.id === defaultMonthId()) ?? op.months[0],
    [op.months],
  )

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

  const reportBusy = recLoading || payLoading || profitability.isLoading || capacity.isLoading
  const reportError = recError || payError || profitability.isError || capacity.isError
  const retryAll = () => {
    op.retry()
    refetchRec()
    refetchPay()
    profitability.refetch()
    capacity.refetch()
  }

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
        <PanelGroup layout="inline" inlineAt="xl">
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

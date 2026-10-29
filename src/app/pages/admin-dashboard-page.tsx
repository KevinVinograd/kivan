import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'

import { PageHeader, PageContent, PanelGroup, Panel } from '@/app/components/templates'
import { Tabs, TabsContent } from '@/app/components/components'
import { useDaytime } from '@/app/daytime'
import { useAuth } from '@/app/lib/auth-store'
import { greetingName } from './clients-team'
import { useMonthlyOperation, useRevalidateOnOpen } from './monthly-operation-data'
import { defaultMonthId } from './monthly-operation-mock-data'
import { getAdminDashboardData } from './admin-dashboard-data'
import { monthIdToPeriod } from './dashboard-data'
import { useReportsCapacity, useReportsProfitability } from './reports-api-data'
import { adminDashboardHeaderActions } from './admin-dashboard-header-controls'
import { AdminCloseSummary } from './admin-dashboard-summary'
import { CriticalOperationsList } from './admin-dashboard-pendientes'
import { HoursCompletenessCard } from './admin-dashboard-hours'
import { ProductionsAndExpensesCard } from './admin-dashboard-productions'
import { TeamPaymentsOperationsCard } from './admin-dashboard-team-payments'
import { ClientCollectionsOperationsCard } from './admin-dashboard-collections'
import { BillingAndArcaCard } from './admin-dashboard-billing'
import { FixedExpensesCard } from './admin-dashboard-expenses'
import { RecentActivityList } from './dashboard-activity'
import { AdminDashboardEmptyMonth, AdminDashboardError, AdminDashboardLoading } from './admin-dashboard-states'
import type { CloseSummaryKpiId } from './admin-dashboard-types'

export function AdminOperationsDashboardPage() {
  const op = useMonthlyOperation()
  useRevalidateOnOpen(defaultMonthId())
  const navigate = useNavigate()
  const { greeting } = useDaytime()
  const { me } = useAuth()
  const greetName = me ? greetingName({ name: `${me.firstName} ${me.lastName}`.trim(), firstName: me.firstName }) : ''
  const [selectedSection, setSelectedSection] = useState<CloseSummaryKpiId>('cierre')

  const { record, previous } = useMemo(() => {
    const index = op.months.findIndex((month) => month.id === defaultMonthId())
    const resolved = index >= 0 ? index : 0
    return { record: op.months[resolved], previous: op.months[resolved + 1] }
  }, [op.months])

  const period = record ? monthIdToPeriod(record.id) : null
  const profitability = useReportsProfitability(period ?? '', period != null)
  const capacity = useReportsCapacity(period != null)

  const data = useMemo(
    () =>
      getAdminDashboardData(record, previous, {
        profitability: profitability.data,
        capacity: capacity.data,
      }),
    [record, previous, profitability.data, capacity.data],
  )

  const reportBusy = profitability.isLoading || capacity.isLoading
  const reportError = profitability.isError || capacity.isError
  const retryAll = () => {
    op.retry()
    profitability.refetch()
    capacity.refetch()
  }
  let body
  if (op.loadStatus === 'loading' || reportBusy) {
    body = <AdminDashboardLoading />
  } else if (op.loadStatus === 'error' || reportError) {
    body = <AdminDashboardError onRetry={retryAll} />
  } else if (!data.hasData) {
    body = <AdminDashboardEmptyMonth />
  } else {
    body = (
      <Tabs
        value={selectedSection}
        onValueChange={(value) => setSelectedSection(value as CloseSummaryKpiId)}
        className="gap-4 md:gap-6"
      >
        <AdminCloseSummary kpis={data.kpis} selectedId={selectedSection} onSelect={setSelectedSection} />
        <PanelGroup layout="inline" inlineAt="xl">
          <Panel type="fill">
            <TabsContent value="cierre">
              <CriticalOperationsList pendings={data.pendings} />
            </TabsContent>
            <TabsContent value="datos" className="flex flex-col gap-4 md:gap-6">
              <HoursCompletenessCard hours={data.hours} />
              <ProductionsAndExpensesCard productions={data.productions} />
            </TabsContent>
            <TabsContent value="pagos" className="flex flex-col gap-4 md:gap-6">
              <TeamPaymentsOperationsCard payments={data.teamPayments} />
              <ClientCollectionsOperationsCard collections={data.collections} />
            </TabsContent>
            <TabsContent value="facturacion" className="flex flex-col gap-4 md:gap-6">
              <BillingAndArcaCard billing={data.billing} />
              <FixedExpensesCard expenses={data.expenses} />
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
        subtitle={record?.label ? { variant: 'text', value: record.label } : undefined}
        actions={adminDashboardHeaderActions(navigate)}
      />
      <PageContent>{body}</PageContent>
    </>
  )
}

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

/**
 * Admin / Operations Dashboard — the monthly-close control center (route
 * `/dashboard`, `admin` role variant). A read-only page whose four close-readiness
 * KPIs double as a radio filter (a naked `Tabs` group, defaulting to estado del
 * cierre): each card owns the main-column section shown below — pendientes
 * críticos; horas + producciones y viáticos; pagos al equipo + cobros de
 * clientes; or facturación y ARCA + gastos fijos. A secondary rail holds
 * actividad reciente, always visible under any panel. It reads like an
 * operational checklist, not an analytics dashboard.
 *
 * Every figure is derived in `admin-dashboard-data.ts` from existing module data
 * (the live Operación mensual store + the Reportes capacity derivation). The page
 * is pinned to the current month (like the Owner dashboard); nothing here writes
 * data or exposes a payment / invoice / ARCA action.
 */
export function AdminOperationsDashboardPage() {
  const op = useMonthlyOperation()
  useRevalidateOnOpen(defaultMonthId())
  const navigate = useNavigate()
  const { greeting } = useDaytime()
  const { me } = useAuth()
  // Greet the real signed-in user (neutral greeting before /auth/me resolves).
  const greetName = me ? greetingName({ name: `${me.firstName} ${me.lastName}`.trim(), firstName: me.firstName }) : ''
  // Radio filter: one KPI card is always active, defaulting to estado del cierre.
  const [selectedSection, setSelectedSection] = useState<CloseSummaryKpiId>('cierre')

  // Pinned to the current month; `months` is newest-first so the previous month
  // (for the gastos-fijos variation) sits at the next index.
  const { record, previous } = useMemo(() => {
    const index = op.months.findIndex((month) => month.id === defaultMonthId())
    const resolved = index >= 0 ? index : 0
    return { record: op.months[resolved], previous: op.months[resolved + 1] }
  }, [op.months])

  // Real report aggregates for the month (owner+admin `/reports/*`). Admin holds both
  // capabilities, so both are fetched; capacity is what un-deads the "Horas y productividad"
  // card, which without it can only ever say "No disponible".
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

  // The load state comes from the bundle fetch this page reads, not from a timer. The old
  // `setTimeout(() => setStatus('ready'), 400)` made `error` unreachable, so a failed fetch
  // fell through to the empty-month branch and told the admin "no hay datos cargados para
  // este mes" — a false statement of fact about a month that simply never arrived. The report
  // aggregates are folded in so the page fails as a unit (SE001): a broken capacity fetch
  // must not silently render the Horas card as an empty "No disponible".
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
        {/* inlineAt="xl": Actividad reciente (aside) stacks below the close-readiness panel
            on laptops (<1280px), splitting into two columns only at xl+. */}
        <PanelGroup layout="inline" inlineAt="xl">
          {/* Main column: the KPI-selected close-readiness panel. */}
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
          {/* Fluid secondary rail: always-on awareness, independent of the active KPI. */}
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

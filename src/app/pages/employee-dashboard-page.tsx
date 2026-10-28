import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'

import { PageHeader, PageContent, PanelGroup, Panel } from '@/app/components/templates'
import { Tabs, TabsContent } from '@/app/components/components'
import { useDaytime } from '@/app/daytime'
import { useAuth } from '@/app/lib/auth-store'
import { greetingName } from './clients-team'
import { useMonthlyOperation, useRevalidateOnOpen } from './monthly-operation-data'
import { defaultMonthId } from './monthly-operation-mock-data'
import { getEmployeeDashboardData } from './employee-dashboard-data'
import { employeeDashboardHeaderActions } from './employee-dashboard-header-controls'
import { EmployeeDashboardEmpty } from './employee-dashboard-states'
import { EmployeeSummary, type EmployeeMetricId } from './employee-dashboard-summary'
import { EmployeePendingList } from './employee-dashboard-pending'
import { AssignedClientsSnapshot } from './employee-dashboard-clients'
import { MonthlyObjectivesSnapshot } from './employee-dashboard-objectives'
import { EmployeeHoursSnapshot } from './employee-dashboard-hours'
import { EmployeeTasksSnapshot } from './employee-dashboard-tasks'
import { ExtrasAndExpensesSnapshot } from './employee-dashboard-extras'
import { EmployeeClientAlerts } from './employee-dashboard-alerts'
import { EmployeeRecentActivityList } from './employee-dashboard-activity'

/**
 * Employee Dashboard — the team-member-facing personal work cockpit (route
 * `/dashboard`, `employee` role variant). A read-only page whose four summary
 * KPIs double as a radio filter (a naked `Tabs` group, defaulting to pending):
 * each card owns the main-column section shown below — mis pendientes; mis
 * clientes; objetivos del mes; or horas cargadas + producciones y tareas + extras
 * y viáticos. Alertas de mis clientes sits inside the mis clientes panel, so it
 * only surfaces with that KPI; a fluid secondary rail holds actividad reciente,
 * always visible under any panel. It never exposes owner/admin figures (revenue,
 * margin, profitability, other people's pay/banking, ARCA).
 *
 * Data is a standalone employee mock (`employee-dashboard-data.ts`) anchored to
 * one team member. The month selector drives all data locally and never mutates
 * the shared monthly selection. Nothing here writes data.
 */
export function EmployeeDashboardPage() {
  const op = useMonthlyOperation()
  useRevalidateOnOpen(defaultMonthId())
  const navigate = useNavigate()
  const { greeting } = useDaytime()
  const { me } = useAuth()
  // Greet the real signed-in user (neutral greeting before /auth/me resolves).
  const greetName = me ? greetingName({ name: `${me.firstName} ${me.lastName}`.trim(), firstName: me.firstName }) : ''
  // Radio filter: one summary card is always active, defaulting to pending.
  const [selectedSection, setSelectedSection] = useState<EmployeeMetricId>('pending')

  // Pinned to the current month (like the Owner dashboard); no period selector.
  const record = useMemo(
    () => op.months.find((month) => month.id === defaultMonthId()) ?? op.months[0],
    [op.months],
  )
  const data = useMemo(() => getEmployeeDashboardData(record, greetName), [record, greetName])

  // No loading or error state, deliberately, and unlike its owner/admin siblings: this page
  // has NOTHING to load. `getEmployeeDashboardData` reads only `record.id` and `record.label`
  // and builds every figure from a standalone mock, so it never touches the plan bundle and
  // no fetch here can fail. It used to fake a 400ms skeleton with a timer and carried an
  // error branch nothing could reach. A skeleton for a fetch that does not exist is theatre.
  // When the employee data is wired to the API, re-derive the state from THAT query.
  let body
  if (!data.hasData) {
    body = <EmployeeDashboardEmpty />
  } else {
    body = (
      <Tabs
        value={selectedSection}
        onValueChange={(value) => setSelectedSection(value as EmployeeMetricId)}
        className="gap-4 md:gap-6"
      >
        <EmployeeSummary data={data} selectedId={selectedSection} onSelect={setSelectedSection} />
        <PanelGroup layout="inline">
          {/* Main column: the KPI-selected personal-work panel. */}
          <Panel type="fill">
            <TabsContent value="pending">
              <EmployeePendingList pending={data.pending} />
            </TabsContent>
            <TabsContent value="clients" className="flex flex-col gap-4 md:gap-6">
              <AssignedClientsSnapshot clients={data.clients} />
              <EmployeeClientAlerts alerts={data.alerts} />
            </TabsContent>
            <TabsContent value="objectives">
              <MonthlyObjectivesSnapshot objectives={data.objectives} />
            </TabsContent>
            <TabsContent value="hours" className="flex flex-col gap-4 md:gap-6">
              <EmployeeHoursSnapshot hours={data.hours} />
              <EmployeeTasksSnapshot tasks={data.tasks} />
              <ExtrasAndExpensesSnapshot extras={data.extras} />
            </TabsContent>
          </Panel>
          {/* Secondary rail: always-on actividad reciente, independent of the
              active KPI. Alertas de mis clientes now lives inside the mis
              clientes panel, surfaced only with that KPI. */}
          <Panel type="aside">
            <EmployeeRecentActivityList activity={data.activity} clients={data.clients} />
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
        actions={employeeDashboardHeaderActions(navigate)}
      />
      <PageContent>{body}</PageContent>
    </>
  )
}

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

export function EmployeeDashboardPage() {
  const op = useMonthlyOperation()
  useRevalidateOnOpen(defaultMonthId())
  const navigate = useNavigate()
  const { greeting } = useDaytime()
  const { me } = useAuth()
  const greetName = me ? greetingName({ name: `${me.firstName} ${me.lastName}`.trim(), firstName: me.firstName }) : ''
  const [selectedSection, setSelectedSection] = useState<EmployeeMetricId>('pending')

  const record = useMemo(
    () => op.months.find((month) => month.id === defaultMonthId()) ?? op.months[0],
    [op.months],
  )
  const data = useMemo(() => getEmployeeDashboardData(record, greetName), [record, greetName])

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

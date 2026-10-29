import type { MonthRecord } from './monthly-operation-mock-data'
import type { EmployeeDashboardData } from './employee-dashboard-types'

export function getEmployeeDashboardData(record: MonthRecord, employeeName: string): EmployeeDashboardData {
  return {
    monthId: record.id,
    monthLabel: record.label,
    employeeName,
    hasData: false,
    summary: {
      assignedClients: 0,
      activeClients: 0,
      objectivesCompleted: 0,
      objectivesTotal: 0,
      hoursLoaded: 0,
      missingHours: 0,
      pendingCount: 0,
    },
    pending: [],
    clients: [],
    objectives: [],
    hours: {
      loadedThisWeek: 0,
      loadedThisMonth: 0,
      expectedThisMonth: null,
      missingHours: 0,
      clientsWithoutHoursThisWeek: 0,
      breakdown: [],
    },
    tasks: { assigned: 0, pending: 0, dueThisWeek: 0, overdue: 0, items: [] },
    extras: { extrasPending: 0, extrasDeclared: 0, viaticsPending: 0, viaticsLoaded: 0, items: [] },
    alerts: [],
    activity: [],
  }
}

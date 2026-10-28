/**
 * Employee Dashboard — derivation layer.
 *
 * The employee's personal per-month view. None of its sections — pendientes,
 * objetivos, horas, producciones/tareas, extras/viáticos, alertas, actividad — has
 * a backend source yet (HOLD does not track them), so the dataset is empty and the
 * page shows its honest empty state until an employee has real data. Only the
 * employee's own name is real (passed in from the signed-in user). No mock, no
 * fake delays; formatting lives in `employee-dashboard-format.ts`.
 */
import type { MonthRecord } from './monthly-operation-mock-data'
import type { EmployeeDashboardData } from './employee-dashboard-types'

/**
 * Build the employee dashboard dataset for a month record. Every section is empty
 * (no backend source yet), so `hasData` is false and the page renders
 * `EmployeeDashboardEmpty`. `employeeName` is the real signed-in user's name.
 */
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

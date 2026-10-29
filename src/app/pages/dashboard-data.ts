import { fromMonthId } from '@/app/lib/periods'
import { differenceInDays, endOfMonth, parseISO } from 'date-fns'

import { toIsoDate } from '@/app/lib/iso-date'
import { buildTrailHref } from '@/app/lib/nav-trail'
import { DASHBOARD_CRUMB } from './dashboard-trail'
import type { CollectionStatus } from './cobros-mock-data'
import { getReportData, type ReportInputs } from './reports-data'
import type { ReportDataset } from './reports-types'
import type { ReportPeriod } from './reports-periods'
import { summarize, MONOTRIBUTO_FULL_LABEL } from './monthly-operation-format'
import {
  CHECKLIST_ITEMS,
  type AlertType,
  type MonthId,
  type MonthlyAlert,
  type MonthRecord,
} from './monthly-operation-mock-data'
import { buildActivityPreviews } from './dashboard-activity-previews'
import { computeClientRisks, sortRisks } from './dashboard-risk'
import type {
  DashboardAlert,
  DashboardData,
  HealthKpis,
  MarginBand,
  MarginClient,
  OperationStatus,
  PaymentRowStatus,
  PendingPayments,
  ProfitabilitySnapshot,
  RiskLevel,
  TeamLoad,
  TeamLoadStatus,
} from './dashboard-types'

const sum = <T,>(items: T[], pick: (item: T) => number) => items.reduce((t, i) => t + pick(i), 0)

export function monthIdToPeriod(monthId: MonthId): ReportPeriod {
  return fromMonthId(monthId)
}

export function clientRiskMap(
  monthId: MonthId,
  inputs?: Pick<ReportInputs, 'profitability' | 'capacity'>,
): Map<string, RiskLevel> {
  const period = monthIdToPeriod(monthId)
  if (!inputs?.profitability?.length) return new Map()
  const report = getReportData(period, {
    receivables: [],
    payments: [],
    profitability: inputs.profitability,
    capacity: inputs.capacity,
  })
  return new Map(
    computeClientRisks(report.profitability, report.capacity).map((risk) => [
      risk.clientId,
      risk.level,
    ]),
  )
}

const COLLECTION_ROW_STATUS: Record<CollectionStatus, PaymentRowStatus> = {
  collected: 'pagado',
  pending: 'pendiente',
  overdue: 'vencido',
  partial: 'parcial',
  cancelled: 'pendiente',
}

function marginBand(margen: number): MarginBand {
  if (margen >= 30) return 'high'
  if (margen < 20) return 'low'
  return 'medium'
}

const LOAD_STATUS: Record<string, TeamLoadStatus> = {
  sobrecargada: 'alta',
  balanceada: 'normal',
  subutilizada: 'baja',
  sin_carga: 'sin_carga',
}

const ALERT_CTA: Record<AlertType, { label: string; href: string }> = {
  cobros: {
    label: 'Ver cobro',
    href: buildTrailHref('/operacion-mensual?block=clientes', DASHBOARD_CRUMB, new URLSearchParams()),
  },
  facturacion: {
    label: 'Revisar facturación',
    href: buildTrailHref('/billing', DASHBOARD_CRUMB, new URLSearchParams()),
  },
  arca: {
    label: 'Revisar facturación',
    href: buildTrailHref('/billing', DASHBOARD_CRUMB, new URLSearchParams()),
  },
  equipo: { label: 'Ver equipo', href: buildTrailHref('/team', DASHBOARD_CRUMB, new URLSearchParams()) },
  rentabilidad: {
    label: 'Analizar cliente',
    href: buildTrailHref('/reports?tab=rentabilidad', DASHBOARD_CRUMB, new URLSearchParams()),
  },
  comercial: { label: 'Ver cliente', href: buildTrailHref('/clients', DASHBOARD_CRUMB, new URLSearchParams()) },
}

const ALERT_TITLE: Record<AlertType, (entity: string) => string> = {
  cobros: (e) => `${e} tiene un pago vencido`,
  facturacion: (e) => `Revisar la facturación de ${e}`,
  arca: (e) => `${e} cerca del límite`,
  equipo: (e) => `${e} con datos pendientes`,
  rentabilidad: (e) => `${e} por debajo del margen objetivo`,
  comercial: (e) => `${e} requiere seguimiento`,
}

const SEVERITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 } as const

function buildAlerts(record: MonthRecord): DashboardAlert[] {
  const { alerts, monotributo } = record.data
  return alerts
    .filter((alert) => alert.status !== 'resolved')
    .slice()
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])
    .map((alert: MonthlyAlert) => ({
      id: alert.id,
      title: ALERT_TITLE[alert.type](alert.entity),
      description: arcaDescription(alert, monotributo) ?? alert.description,
      severity: alert.severity,
      entity: alert.entity,
      ctaLabel: ALERT_CTA[alert.type].label,
      ctaHref: ALERT_CTA[alert.type].href,
    }))
}

function arcaDescription(alert: MonthlyAlert, watch: MonthRecord['data']['monotributo']): string | null {
  if (alert.type !== 'arca') return null
  const match = watch.find((entry) => MONOTRIBUTO_FULL_LABEL[entry.category] === alert.entity)
  if (!match || match.annualLimit <= 0) return null
  const pct = Math.round((match.annualBilled / match.annualLimit) * 100)
  return `Está al ${pct}% del límite anual de la categoría.`
}

function buildOperation(record: MonthRecord, report: ReportDataset | null): OperationStatus {
  const data = record.data
  const checked = CHECKLIST_ITEMS.filter((item) => data.checklist[item.id]).length
  const completion = Math.round((checked / CHECKLIST_ITEMS.length) * 100)

  const totalClients = data.clients.length
  const cobros = data.clients.filter((client) => client.paidAmount > 0).length
  const totalTeam = data.team.length
  const pagos = data.team.filter((payout) => payout.statementStatus !== 'draft').length
  const totalProductions = data.productions.length
  const viaticos = data.productions.filter((production) => production.viatics > 0).length
  const extras = sum(data.clients, (client) => client.extras.length)
  const measurable = report?.capacity.filter((c) => c.utilization != null) ?? []
  const avgUtil =
    measurable.length > 0
      ? measurable.reduce((t, c) => t + (c.utilization ?? 0), 0) / measurable.length
      : null
  const horas = avgUtil != null ? Math.min(100, Math.round(avgUtil * 100)) : null

  const lines: OperationStatus['lines'] = [
    { id: 'cobros', label: 'Cobros registrados', value: `${cobros} / ${totalClients}`, tone: 'default' },
    { id: 'pagos', label: 'Pagos calculados', value: `${pagos} / ${totalTeam}`, tone: 'default' },
    { id: 'horas', label: 'Horas cargadas', value: horas != null ? `${horas}%` : 'No disponible', tone: 'default' },
    { id: 'viaticos', label: 'Viáticos cargados', value: `${viaticos} / ${totalProductions}`, tone: 'default' },
    { id: 'extras', label: 'Extras registrados', value: String(extras), tone: 'default' },
    {
      id: 'facturacion',
      label: 'Facturación revisada',
      value: data.checklist.invoices_issued ? 'Lista' : 'Pendiente',
      tone: data.checklist.invoices_issued ? 'success' : 'warning',
    },
  ]

  return { completion, pendingItems: CHECKLIST_ITEMS.length - checked, lines, monthLabel: record.label }
}

function toMarginClient(item: { clientId: string; clientName: string; margen: number }): MarginClient {
  return {
    clientId: item.clientId,
    clientName: item.clientName,
    marginPercent: Math.round(item.margen),
    band: marginBand(item.margen),
  }
}

function buildProfitability(report: ReportDataset): ProfitabilitySnapshot {
  const byMargin = [...report.profitability].sort((a, b) => b.margen - a.margen)
  return {
    ingresos: report.summary.ingresos,
    egresos: report.summary.egresos,
    teamCost: sum(report.profitability, (item) => item.teamCost),
    fixedExpenses: report.financials.gastosFijos,
    estimatedResult: report.summary.rentabilidad,
    marginPercent: report.summary.margenPromedio,
    otherLaneCount: report.summary.otherLaneCount,
    otherLanePaymentCount: report.summary.otherLanePaymentCount,
    bestMargin: byMargin.slice(0, 3).map(toMarginClient),
    lowMargin: byMargin.slice(-3).reverse().map(toMarginClient),
  }
}

function buildPayments(record: MonthRecord, report: ReportDataset, referenceIso: string): PendingPayments {
  const op = summarize(record.data)
  const reference = parseISO(referenceIso)
  const cobros = report.financials.cobrosDetail

  const rows = cobros
    .filter((r) => r.status !== 'collected' && r.status !== 'cancelled' && r.totalAmount - r.collectedAmount > 0)
    .map((r) => ({
      clientId: r.id,
      clientName: r.clientName,
      amount: r.totalAmount - r.collectedAmount,
      status: COLLECTION_ROW_STATUS[r.status as CollectionStatus] ?? 'pendiente',
      dueIso: r.dueDate,
      overdueDays:
        r.status === 'overdue' && r.dueDate
          ? Math.max(0, differenceInDays(reference, parseISO(r.dueDate)))
          : null,
    }))
    .sort(
      (a, b) =>
        Number(b.status === 'vencido') - Number(a.status === 'vencido') || b.amount - a.amount,
    )
    .slice(0, 5)

  return {
    totalExpected: op.totalToCollect,
    totalCollected: op.collected,
    totalPending: op.pendingToCollect,
    overdueClients: report.financials.countsAllLanes.overdue,
    rows,
    otherLaneCount: report.financials.otherLaneCount,
  }
}

function buildTeamLoad(report: ReportDataset, riskByName: Map<string, string>): TeamLoad {
  const members = report.capacity.map((member) => ({
    personId: member.personId,
    personName: member.personName,
    hours: member.hoursLogged,
    capacity: member.capacity,
    clientsCount: member.clientsActive,
    status: LOAD_STATUS[member.status] ?? 'sin_carga',
    relatedRisk: riskByName.get(member.personName),
  }))
  const totalHours = sum(members, (member) => member.hours)
  return {
    totalHours,
    averageHours: members.length > 0 ? Math.round(totalHours / members.length) : 0,
    overloaded: report.capacity.filter((member) => member.status === 'sobrecargada').length,
    underloaded: report.capacity.filter((member) => member.status === 'subutilizada').length,
    missingHours: report.capacity.filter((member) => member.status === 'sin_carga').length,
    members,
  }
}

function riskByPerson(risks: { clientName: string; level: string; team: string[] }[]): Map<string, string> {
  const map = new Map<string, string>()
  for (const risk of risks) {
    if (risk.level === 'saludable') continue
    for (const name of risk.team) {
      if (!map.has(name)) map.set(name, `Riesgo en ${risk.clientName}`)
    }
  }
  return map
}

export function getDashboardData(record: MonthRecord, report: ReportDataset | null): DashboardData {
  const referenceIso = toIsoDate(endOfMonth(parseISO(`${record.id}-01`)))

  const risks = report
    ? sortRisks(computeClientRisks(report.profitability, report.capacity))
    : []
  const hasData =
    (report?.profitability.length ?? 0) > 0 ||
    record.data.clients.length > 0 ||
    record.data.team.length > 0 ||
    record.data.productions.length > 0

  const checked = CHECKLIST_ITEMS.filter((item) => record.data.checklist[item.id]).length

  const kpis: HealthKpis = {
    clientsAtRisk: risks.filter((risk) => risk.level === 'riesgo_alto').length,
    clientsInAttention: risks.filter((risk) => risk.level === 'atencion').length,
    ingresosRegistrados: report ? report.financials.totalCobrado : null,
    paidClients: report ? report.financials.countsAllLanes.collected : null,
    totalClients: report ? report.financials.countsAllLanes.total : null,
    marginPercent: report ? report.summary.margenPromedio : null,
    estimatedProfit: report && report.summary.egresos > 0 ? report.summary.rentabilidad : null,
    operationCompletion: Math.round((checked / CHECKLIST_ITEMS.length) * 100),
    pendingDataItems: CHECKLIST_ITEMS.length - checked,
    overloadedTeam: report ? report.capacity.filter((member) => member.status === 'sobrecargada').length : 0,
    teamMissingHours: report ? report.capacity.filter((member) => member.status === 'sin_carga').length : null,
  }

  return {
    monthId: record.id,
    monthLabel: record.label,
    hasData,
    kpis,
    risks: risks.filter((risk) => risk.level !== 'saludable').slice(0, 5),
    alerts: buildAlerts(record),
    operation: buildOperation(record, report),
    profitability: report ? buildProfitability(report) : null,
    payments: hasData && report ? buildPayments(record, report, referenceIso) : null,
    teamLoad: report ? buildTeamLoad(report, riskByPerson(risks)) : null,
    activity: [],
    activityPreviews: buildActivityPreviews(report),
  }
}

/**
 * Admin / Operations Dashboard — heavier section derivations.
 *
 * Pure builders for the three richest sections: team payments (§5), billing +
 * ARCA (§7) and the prioritized critical-pendings list (§2). Split out of
 * `admin-dashboard-data.ts` to keep both derivation files within the file-size
 * budget. All values come from the live Operación mensual record; nothing here
 * mutates or calls a backend. The orchestrator in `admin-dashboard-data.ts`
 * composes these with the lighter section builders.
 */
import {
  bankComplete,
  clientTotalToBill,
  MONOTRIBUTO_FULL_LABEL,
  MONOTRIBUTO_LABEL,
  monotributoUsagePct,
  payoutTotal,
} from './monthly-operation-format'
import type { MonthRecord, Monotributo, TeamPayout } from './monthly-operation-mock-data'
import type {
  BillingAndArca,
  BillingItemRow,
  BillingItemStatus,
  HoursCompleteness,
  MonotributoAlert,
  OperationPending,
  TeamPayments,
  TeamPayStatus,
} from './admin-dashboard-types'
import { SEVERITY_RANK } from './admin-dashboard-format'
import { isActiveBilling, ROUTE } from './admin-dashboard-routes'
import { withDashboardTrail } from './dashboard-trail'


// ── §5 Pagos al equipo ───────────────────────────────────────────────────────
function payState(
  payout: TeamPayout,
  missingHoursNames: Set<string>,
  viaticPeople: Set<string>,
): { status: TeamPayStatus; blocker: string | null; href: string } {
  if (payout.payoutStatus === 'paid')
    return { status: 'pagado', blocker: null, href: withDashboardTrail(ROUTE.operacionEquipo) }
  if (!bankComplete(payout)) return { status: 'bloqueado', blocker: 'Falta CBU', href: withDashboardTrail(ROUTE.team) }
  if (viaticPeople.has(payout.name))
    return { status: 'bloqueado', blocker: 'Viáticos sin validar', href: withDashboardTrail(ROUTE.operacionEquipo) }
  if (missingHoursNames.has(payout.name))
    return { status: 'bloqueado', blocker: 'Faltan horas', href: withDashboardTrail(ROUTE.operacionEquipo) }
  if (payout.payoutStatus === 'partial')
    return { status: 'pendiente', blocker: 'Pago parcial', href: withDashboardTrail(ROUTE.operacionEquipo) }
  return { status: 'listo', blocker: null, href: withDashboardTrail(ROUTE.operacionEquipo) }
}

const PAY_RANK: Record<TeamPayStatus, number> = { bloqueado: 0, pendiente: 1, listo: 2, pagado: 3 }

/**
 * The month's payroll for the admin home.
 *
 * The three money figures come from `summarize()` rather than being recomputed here. They
 * used to be `sum(team, payoutTotal)`, which reads PayoutStatements alone — the source that
 * is empty in every workspace whose payroll is recorded in `/pagos`. Both screens agreed
 * while both were blind; the moment `/operacion-mensual` learned to read payments, this one
 * would have kept showing $0 "Total a pagar" to the same admin, one route away, during the
 * work the number exists for.
 *
 * The ROWS stay statement-derived: they carry a per-member lifecycle (bank data, blockers,
 * `payoutStatus`) that a payment has no equivalent for.
 */
export function buildTeamPayments(
  team: TeamPayout[],
  payroll: { totalToPayTeam: number; paidToTeam: number },
  missingHoursNames: Set<string>,
  viaticPeople: Set<string>,
): TeamPayments {
  const rows = team
    .map((payout) => {
      const state = payState(payout, missingHoursNames, viaticPeople)
      return {
        payoutId: payout.id,
        personName: payout.name,
        amount: payoutTotal(payout),
        status: state.status,
        blocker: state.blocker,
        ctaHref: state.href,
      }
    })
    .sort((a, b) => PAY_RANK[a.status] - PAY_RANK[b.status] || b.amount - a.amount)
  const totalToPay = payroll.totalToPayTeam
  const paid = payroll.paidToTeam
  return {
    totalToPay,
    paid,
    pending: totalToPay - paid,
    blocked: rows.filter((row) => row.status === 'bloqueado').length,
    missingBank: team.filter((p) => !bankComplete(p)).length,
    rows,
  }
}

// ── §7 Facturación y ARCA ────────────────────────────────────────────────────
function monotributoAlert(pct: number): MonotributoAlert {
  if (pct >= 90) return 'limite'
  if (pct >= 80) return 'atencion'
  return 'normal'
}

export function buildBilling(record: MonthRecord): BillingAndArca {
  const { clients, monotributo } = record.data
  const active = clients.filter(isActiveBilling)
  const monotributos = monotributo.map((watch) => {
    const usagePercent = Math.round(monotributoUsagePct(watch))
    return {
      id: watch.category,
      label: MONOTRIBUTO_FULL_LABEL[watch.category],
      usagePercent,
      billed: watch.annualBilled,
      alert: monotributoAlert(usagePercent),
      ctaHref: withDashboardTrail(ROUTE.facturacion),
    }
  })
  const alertByCat = new Map<Monotributo, MonotributoAlert>(monotributos.map((m) => [m.id, m.alert]))
  const items: BillingItemRow[] = active
    .filter((client) => client.invoiceStatus === 'not_issued' || client.invoiceStatus === 'issued')
    .map((client) => {
      const alert = alertByCat.get(client.monotributo)
      const status: BillingItemStatus =
        alert === 'limite' ? 'bloqueado' : client.invoiceStatus === 'issued' ? 'revisado' : 'pendiente'
      return {
        clientId: client.clientId,
        clientName: client.name,
        amount: clientTotalToBill(client),
        monotributo: MONOTRIBUTO_LABEL[client.monotributo],
        status,
        ctaHref: withDashboardTrail(ROUTE.facturacion),
      }
    })
    .slice(0, 5)
  const usages = monotributos.map((m) => m.usagePercent)
  return {
    invoicesPending: active.filter((client) => client.invoiceStatus === 'not_issued').length,
    invoicesReviewed: active.filter((client) => client.invoiceStatus !== 'not_issued').length,
    monotributosActive: monotributos.length,
    monotributosAlert: monotributos.filter((m) => m.alert !== 'normal').length,
    usageEstimate: usages.length > 0 ? Math.max(...usages) : null,
    monotributos,
    items,
  }
}

// ── §2 Pendientes críticos ───────────────────────────────────────────────────
/** Prioritized list of operational blockers assembled from structural store signals. */
export function buildPendings(
  record: MonthRecord,
  hours: HoursCompleteness | null,
  billing: BillingAndArca,
): OperationPending[] {
  const { clients, team, productions } = record.data
  const out: OperationPending[] = []

  // Missing hours (top 3 by gap).
  for (const row of (hours?.rows ?? []).filter((r) => r.status !== 'completo').slice(0, 3)) {
    out.push({
      id: `hrs-${row.personId}`,
      title: `${row.personName} ${row.status === 'sin_carga' ? 'no cargó horas' : 'tiene horas sin cargar'}`,
      description: 'Faltan horas para calcular productividad y pago mensual.',
      type: 'horas',
      severity: row.status === 'sin_carga' ? 'alta' : 'media',
      responsible: row.personName,
      entity: row.personName,
      ctaLabel: 'Ver carga de horas',
      ctaHref: withDashboardTrail(ROUTE.operacionEstado),
    })
  }

  // Team payment blocked by missing banking data.
  for (const payout of team.filter((p) => p.payoutStatus !== 'paid' && !bankComplete(p))) {
    out.push({
      id: `bank-${payout.id}`,
      title: `Pago de ${payout.name} bloqueado`,
      description: 'Faltan datos bancarios (CBU/CVU) para liquidar el pago.',
      type: 'banco',
      severity: 'alta',
      responsible: 'Administración',
      entity: payout.name,
      ctaLabel: 'Resolver pago',
      ctaHref: withDashboardTrail(ROUTE.team),
    })
  }

  // Client charges overdue or unregistered.
  for (const client of clients.filter((c) => c.monthStatus !== 'churned')) {
    if (client.paymentStatus === 'overdue') {
      out.push({
        id: `cob-${client.id}`,
        title: `${client.name} tiene un cobro vencido`,
        description: 'El pago del mes está vencido y todavía sin registrar.',
        type: 'cobro',
        severity: 'alta',
        entity: client.name,
        ctaLabel: 'Ver cobro',
        ctaHref: withDashboardTrail(`${ROUTE.operacionClientes}&open=${client.clientId}`),
      })
    } else if (client.paymentStatus === 'pending' && client.paidAmount <= 0 && clientTotalToBill(client) > 0) {
      out.push({
        id: `cob-${client.id}`,
        title: `${client.name} sin cobro registrado`,
        description: 'Todavía no se registró el cobro del mes.',
        type: 'cobro',
        severity: 'media',
        entity: client.name,
        ctaLabel: 'Ver cobro',
        ctaHref: withDashboardTrail(`${ROUTE.operacionClientes}&open=${client.clientId}`),
      })
    }
  }

  // Productions with viáticos pending validation.
  const viaticIds = new Set<string>()
  for (const p of productions.filter((p) => p.viatics > 0 && p.status !== 'invoiced')) {
    viaticIds.add(p.id)
    out.push({
      id: `via-${p.id}`,
      title: `${p.title} tiene viáticos pendientes`,
      description: 'Falta validar gastos antes del cierre.',
      type: 'viaticos',
      severity: 'media',
      responsible: p.responsible,
      entity: p.clientName || p.title,
      ctaLabel: 'Validar viáticos',
      ctaHref: withDashboardTrail(ROUTE.operacionEquipo),
    })
  }

  // Productions not closed (no client or billable undefined), excluding the viáticos rows above.
  for (const p of productions.filter((p) => (p.clientId === '' || p.billable == null) && !viaticIds.has(p.id))) {
    out.push({
      id: `prod-${p.id}`,
      title: `Producción ${p.title} sin cerrar`,
      description:
        p.clientId === '' ? 'Falta asignar el cliente de la producción.' : 'Falta definir si es interna, facturable o mixta.',
      type: 'produccion',
      severity: 'media',
      responsible: p.responsible,
      entity: p.clientName || p.title,
      ctaLabel: 'Ver producción',
      ctaHref: withDashboardTrail(ROUTE.operacionEquipo),
    })
  }

  // Pending invoices.
  for (const client of clients.filter((c) => isActiveBilling(c) && c.invoiceStatus === 'not_issued')) {
    out.push({
      id: `fac-${client.id}`,
      title: `Factura de ${client.name} pendiente`,
      description: 'Cliente marcado para facturar, pero todavía no fue revisado.',
      type: 'facturacion',
      severity: 'media',
      entity: client.name,
      ctaLabel: 'Revisar facturación',
      ctaHref: withDashboardTrail(ROUTE.facturacion),
    })
  }

  // ARCA / monotributo near its annual limit.
  for (const mono of billing.monotributos.filter((m) => m.alert === 'limite')) {
    out.push({
      id: `arca-${mono.id}`,
      title: `${mono.label} cerca del límite`,
      description: `Está al ${mono.usagePercent}% del límite anual de la categoría.`,
      type: 'arca',
      severity: 'alta',
      responsible: 'Administración',
      entity: mono.label,
      ctaLabel: 'Revisar facturación',
      ctaHref: withDashboardTrail(ROUTE.facturacion),
    })
  }

  return out.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]).slice(0, 8)
}

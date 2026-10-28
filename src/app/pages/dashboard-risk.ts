/**
 * Owner Dashboard — client risk score (§2).
 *
 * A simple, local, additive risk model over the REAL per-client profitability for
 * the period (margin, months since increase, uncharged extras, scope overrun, team
 * overload, outstanding collection). Each signal that fires adds its weight and a
 * human-readable reason; the total maps to a band (Saludable 0-2 / Atención 3-5 /
 * Riesgo alto 6+). With no billed clients the list is empty — no invented risk.
 * Pure: no mutation, no mock.
 */
import type { PaymentStatus } from './clients-mock-data'
import type { ClientProfitabilityReportItem, TeamCapacityReportItem } from './reports-types'
import type { ClientRisk, RiskLevel } from './dashboard-types'

/** Signal weights (§2 scoring model). */
const WEIGHT = {
  overdue: 3,
  noIncrease: 2,
  lowMargin: 2,
  scopeOverrun: 2,
  unbilledExtras: 1,
  teamOverload: 1,
} as const

const MONTHS_WITHOUT_INCREASE = 9
const LOW_MARGIN_THRESHOLD = 20

export function riskLevelOf(score: number): RiskLevel {
  if (score >= 6) return 'riesgo_alto'
  if (score >= 3) return 'atencion'
  return 'saludable'
}

/**
 * Scores every billed client for the period from its real profitability item.
 * `capacity` supplies the overloaded-member set for the team-overload signal.
 */
export function computeClientRisks(
  profitability: ClientProfitabilityReportItem[],
  capacity: TeamCapacityReportItem[],
): ClientRisk[] {
  const overloadedNames = new Set(
    capacity.filter((member) => member.status === 'sobrecargada').map((member) => member.personName),
  )

  return profitability.map((prof) => {
    const reasons: string[] = []
    let score = 0

    if (prof.paymentPending) {
      score += WEIGHT.overdue
      reasons.push('Cobro pendiente')
    }

    const months = prof.monthsSinceIncrease
    if (months != null && months >= MONTHS_WITHOUT_INCREASE) {
      score += WEIGHT.noIncrease
      reasons.push(`${months} meses sin aumento`)
    }

    const margin = prof.margen
    if (margin < LOW_MARGIN_THRESHOLD) {
      score += WEIGHT.lowMargin
      reasons.push(`Margen estimado ${Math.round(margin)}%`)
    }

    if (prof.ingresos > 0 && prof.teamCost > prof.ingresos * 0.7) {
      score += WEIGHT.scopeOverrun
      reasons.push('Costo por encima del fee estimado')
    }

    if (prof.unchargedExtras > 0) {
      score += WEIGHT.unbilledExtras
      reasons.push('Trabajos extra sin cobrar')
    }

    if (prof.team.some((name) => overloadedNames.has(name))) {
      score += WEIGHT.teamOverload
      reasons.push('Equipo asignado con sobrecarga')
    }

    const paymentStatus: PaymentStatus = prof.paymentPending ? 'overdue' : 'paid'
    return {
      clientId: prof.clientId,
      clientName: prof.clientName,
      score,
      level: riskLevelOf(score),
      reasons,
      team: prof.team,
      lastTouchIso: undefined,
      daysSinceTouch: null,
      marginPercent: Math.round(margin),
      paymentStatus,
    }
  })
}

/** Sort: highest score, then overdue, then lowest margin (§2). */
export function sortRisks(risks: ClientRisk[]): ClientRisk[] {
  return [...risks].sort(
    (a, b) =>
      b.score - a.score ||
      Number(b.paymentStatus === 'overdue') - Number(a.paymentStatus === 'overdue') ||
      (a.marginPercent ?? 999) - (b.marginPercent ?? 999),
  )
}

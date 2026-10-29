import type { PaymentStatus } from './clients-mock-data'
import type { ClientProfitabilityReportItem, TeamCapacityReportItem } from './reports-types'
import type { ClientRisk, RiskLevel } from './dashboard-types'

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

export function sortRisks(risks: ClientRisk[]): ClientRisk[] {
  return [...risks].sort(
    (a, b) =>
      b.score - a.score ||
      Number(b.paymentStatus === 'overdue') - Number(a.paymentStatus === 'overdue') ||
      (a.marginPercent ?? 999) - (b.marginPercent ?? 999),
  )
}

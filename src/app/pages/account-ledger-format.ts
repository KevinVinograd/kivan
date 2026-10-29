import type { Currency } from '@hold/shared'
import type {
  AccountEntity,
  AccountStatus,
  LedgerEntry,
  LedgerEntityType,
  PeriodStatement,
} from './account-ledger-types'

export { formatCurrency, formatMoney, formatMonthYear, formatShortDate } from './cobranza-format'

function deriveStatus(charged: number, settled: number): AccountStatus {
  if (charged > 0 && settled >= charged) return 'paid'
  if (settled > 0) return 'partial'
  return 'pending'
}

function deriveStatusAcrossLanes(movements: LedgerEntry[]): AccountStatus {
  const byLane = new Map<Currency, { charged: number; settled: number }>()
  for (const m of movements) {
    const lane = byLane.get(m.currency) ?? { charged: 0, settled: 0 }
    lane.charged += m.debit
    lane.settled += m.credit
    byLane.set(m.currency, lane)
  }
  const perLane = [...byLane.values()]
    .filter(({ charged, settled }) => charged > 0 || settled > 0)
    .map(({ charged, settled }) => deriveStatus(charged, settled))
  if (perLane.length === 0) return 'pending'
  if (perLane.every((status) => status === 'paid')) return 'paid'
  if (perLane.some((status) => status === 'paid' || status === 'partial')) return 'partial'
  return 'pending'
}

export function statementsForEntity(entries: LedgerEntry[], entityId: string): PeriodStatement[] {
  const mine = entries.filter((e) => e.entityId === entityId)
  const periods = [...new Set(mine.map((m) => m.period))].sort().reverse()
  return periods.map((period): PeriodStatement => {
    const movements = mine
      .filter((m) => m.period === period)
      .sort((a, b) => a.date.localeCompare(b.date))
    const peso = movements.filter((m) => m.currency === 'ARS')
    const charged = peso.reduce((sum, m) => sum + m.debit, 0)
    const settled = peso.reduce((sum, m) => sum + m.credit, 0)
    const otherLaneCount = movements.length - peso.length

    const pesoUpToHere = mine
      .filter((m) => m.currency === 'ARS' && m.period <= period)
      .sort((a, b) => a.date.localeCompare(b.date))
    const balance = pesoUpToHere.length ? pesoUpToHere[pesoUpToHere.length - 1].balance : 0
    const charge = movements.find((m) => m.type === 'charge' || m.type === 'generated')
    return {
      period,
      charged,
      settled,
      balance,
      otherLaneCount,
      status: deriveStatusAcrossLanes(movements),
      dueDate: charge?.date,
      reference: charge?.invoiceNumber ?? charge?.description,
      notes: movements.find((m) => m.note)?.note,
      movements,
    }
  }).filter((statement) => statement.movements.length > 0)
}

export function entityFromEntries(
  entries: LedgerEntry[],
  entityId: string,
  entityType: LedgerEntityType,
  name: string,
): AccountEntity {
  const statements = statementsForEntity(entries, entityId)
  const latest = statements[0]
  const latestMovements = latest?.movements ?? []
  return {
    entityType,
    entityId,
    name,
    currentBalance: latest?.balance ?? 0,
    otherLaneCount: statements.reduce((sum, s) => sum + s.otherLaneCount, 0),
    status: latest?.status ?? 'pending',
    lastMovementAt: latestMovements[latestMovements.length - 1]?.date,
  }
}

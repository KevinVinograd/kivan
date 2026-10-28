import type { Currency } from '@hold/shared'
import type {
  AccountEntity,
  AccountStatus,
  LedgerEntry,
  LedgerEntityType,
  PeriodStatement,
} from './account-ledger-types'

export { formatCurrency, formatMoney, formatMonthYear, formatShortDate } from './cobranza-format'

/**
 * A coarse statement status from the period totals. Three states shared by both
 * entity types (all valid members of `AccountStatus`); the UI maps each to an
 * entity-aware label ("Cobrado" / "Pagado") and a token.
 */
function deriveStatus(charged: number, settled: number): AccountStatus {
  if (charged > 0 && settled >= charged) return 'paid'
  if (settled > 0) return 'partial'
  return 'pending'
}

/**
 * The status of a whole statement, decided LANE BY LANE and then combined.
 *
 * The money figures beside it are peso-scoped, and feeding those to `deriveStatus` made the
 * badge describe half the statement: a period settled entirely in dollars came back
 * `charged: 0, settled: 0` and read "Pendiente", while a period whose pesos were paid and
 * whose dollars were not read "Cobrado". The badge is a claim about the whole obligation,
 * so it cannot inherit the peso scoping that the amounts need.
 *
 * Comparing within a lane is safe — no dollar is ever added to a peso here. Paid means
 * EVERY lane that was charged is covered; one uncovered lane is enough to keep it open.
 */
function deriveStatusAcrossLanes(movements: LedgerEntry[]): AccountStatus {
  const byLane = new Map<Currency, { charged: number; settled: number }>()
  for (const m of movements) {
    const lane = byLane.get(m.currency) ?? { charged: 0, settled: 0 }
    lane.charged += m.debit
    lane.settled += m.credit
    byLane.set(m.currency, lane)
  }
  // A lane with NO activity is not an unsettled lane. Without this filter a period whose
  // dollar debits and credits net to zero contributed a 'pending', and a fully settled
  // statement was demoted to "Parcial" by a lane that had nothing outstanding in it.
  const perLane = [...byLane.values()]
    .filter(({ charged, settled }) => charged > 0 || settled > 0)
    .map(({ charged, settled }) => deriveStatus(charged, settled))
  if (perLane.length === 0) return 'pending'
  if (perLane.every((status) => status === 'paid')) return 'paid'
  if (perLane.some((status) => status === 'paid' || status === 'partial')) return 'partial'
  return 'pending'
}

/**
 * Group an entity's movements by period (newest first, taken from the movements themselves),
 * summing charged (debit) and settled (credit). The period balance is the running balance of
 * its last movement. A month with no activity produces no statement, because no movement
 * named it.
 */
export function statementsForEntity(entries: LedgerEntry[], entityId: string): PeriodStatement[] {
  const mine = entries.filter((e) => e.entityId === entityId)
  // The months come from the MOVEMENTS, not from a list of candidate months. It used to walk
  // a fixed six-month array and drop the empties, which meant a real movement outside those
  // months was silently absent from the statement — and the array was frozen at Ene–Jun 2026,
  // so by July the current month's movements were among the ones it dropped. Deriving from
  // the data cannot go stale and cannot omit a movement that exists.
  const periods = [...new Set(mine.map((m) => m.period))].sort().reverse()
  return periods.map((period): PeriodStatement => {
    const movements = mine
      .filter((m) => m.period === period)
      .sort((a, b) => a.date.localeCompare(b.date))
    // PESO rows only, on all three. `charged` and `settled` used to add every lane
    // together, and `balance` read the LAST movement's running total — which, now that
    // the accumulator is per lane, would be whichever lane the most recent movement
    // happened to be in. Both are wrong in the same way: one number cannot describe
    // three units. What they leave out is counted below.
    const peso = movements.filter((m) => m.currency === 'ARS')
    const charged = peso.reduce((sum, m) => sum + m.debit, 0)
    const settled = peso.reduce((sum, m) => sum + m.credit, 0)
    const otherLaneCount = movements.length - peso.length

    // The balance CARRIES FORWARD, so it is read from the last peso movement AT OR BEFORE
    // this period — not from within it.
    //
    // A first version read `peso[peso.length - 1].balance` and fell back to 0. That fallback
    // was dead code before the peso filter existed (`statementsForEntity` drops empty
    // statements, so `movements` was never empty), and adding the filter made it live: a
    // period holding only a dollar cobro reported a peso saldo of ZERO, discarding every
    // earlier peso movement. A client owing 500.000 pesos from August whose September holds
    // one dollar row read "$ 0 · Pendiente" on the one screen whose job is to state the debt.
    // A false zero on a money surface is the failure this module's own docblock forbids, and
    // it is strictly worse than the mixed-unit number it replaced: 500.300 tells the
    // operator to go chase something.
    const pesoUpToHere = mine
      .filter((m) => m.currency === 'ARS' && m.period <= period)
      .sort((a, b) => a.date.localeCompare(b.date))
    const balance = pesoUpToHere.length ? pesoUpToHere[pesoUpToHere.length - 1].balance : 0
    // Factura asociada (client) / Concepto (colaboradora): the invoice number when a
    // factura was issued, else the charge/generated movement's concept.
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

/** The master-row summary for an entity: its latest running balance + status. */
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
    /** Movements across every period that `currentBalance` does not describe. */
    otherLaneCount: statements.reduce((sum, s) => sum + s.otherLaneCount, 0),
    status: latest?.status ?? 'pending',
    lastMovementAt: latestMovements[latestMovements.length - 1]?.date,
  }
}

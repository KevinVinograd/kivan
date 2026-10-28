import type { Currency } from '@hold/shared'

import { type Receivable } from './cobros-mock-data'
import type {
  MonthlyTeamStatement,
  TeamMember,
  TeamPaymentRecord,
} from './team-mock-data'
import { type Payment } from './pagos-mock-data'
import type { LedgerEntry } from './account-ledger-types'

/**
 * The live team reads the colaboradora ledger derives from — structurally the
 * subset of the `useTeamData()` (`TeamDataProvider`) value the ledger needs, so a
 * payment approved or registered on /team is reflected in cuentas corrientes. The
 * provider's `paymentHistoryForMember(id)` defaults to count 5, matching the
 * prior snapshot-based derivation exactly.
 */
export type TeamLedgerSource = {
  members: TeamMember[]
  statementForMember: (id: string) => MonthlyTeamStatement | undefined
  paymentHistoryForMember: (id: string) => TeamPaymentRecord[]
}

/** Normalize a period to the `'YYYY-MM-01'` convention (guards against `'YYYY-MM'`). */
function normalizePeriod(p: string): string {
  return p.length === 7 ? `${p}-01` : p
}

/**
 * Sort an entity's movements by date and assign each a running balance IN ITS OWN LANE.
 *
 * One accumulator per lane, not one accumulator. It used to be a single `running`
 * summed over every movement whatever its currency, so an entity holding a peso cobro
 * and a dollar cobro carried a "saldo" that subtracts dollars from pesos — a figure in
 * no currency at all, printed under a "$". It is not even the same
 * kind of quantity: those are fund shares, not money.
 *
 * The rows stay interleaved in date order, because they are one entity's history and
 * splitting them would hide a movement behind a lane filter. Only the accumulation is
 * per lane, so each row's balance answers "how much does this entity owe IN THIS LANE
 * as of this date" — which is the only version of the question that has an answer.
 */
export function withRunningBalance(movements: LedgerEntry[]): LedgerEntry[] {
  movements.sort((a, b) => a.date.localeCompare(b.date))
  const running = new Map<Currency, number>()
  for (const m of movements) {
    const next = (running.get(m.currency) ?? 0) + m.debit - m.credit
    running.set(m.currency, next)
    m.balance = next
  }
  return movements
}

/** Stable client id — the receivables mock keys clients by name. */
function clientKey(r: Receivable): string {
  return r.clientName
}

/**
 * Derive per-client movements from receivables. Each receivable yields a charge
 * (`totalAmount` → debit) on its due date and, when any amount was collected, a
 * collection (`collectedAmount` → credit) on its last-activity date. Movements
 * are grouped per client and assigned a cumulative running balance.
 */
export function clientLedgerEntries(receivables: Receivable[]): LedgerEntry[] {
  const byClient = new Map<string, Receivable[]>()
  for (const r of receivables) {
    const list = byClient.get(clientKey(r)) ?? []
    list.push(r)
    byClient.set(clientKey(r), list)
  }

  const out: LedgerEntry[] = []
  for (const [entityId, list] of byClient) {
    const movements: LedgerEntry[] = []
    for (const r of list) {
      const period = normalizePeriod(r.period)
      movements.push({
        id: `led-${r.id}-charge`,
        entityType: 'client',
        entityId,
        period,
        type: 'charge',
        referenceId: r.id,
        currency: r.currency,
        invoiceNumber: r.invoiceNumber,
        description: `Factura ${r.service}`,
        note: r.notes,
        debit: r.totalAmount,
        credit: 0,
        balance: 0,
        date: r.dueDate,
      })
      if (r.collectedAmount > 0) {
        movements.push({
          id: `led-${r.id}-collection`,
          entityType: 'client',
          entityId,
          period,
          type: 'collection',
          referenceId: r.id,
          currency: r.currency,
          description: `Cobro ${r.service}`,
          debit: 0,
          credit: r.collectedAmount,
          balance: 0,
          date: r.lastActivityAt,
        })
      }
    }
    out.push(...withRunningBalance(movements))
  }
  return out
}

/** Distinct client entity ids (the client names), ordered. */
export function clientEntityIds(receivables: Receivable[]): string[] {
  return [...new Set(clientLedgerEntries(receivables).map((m) => m.entityId))].sort()
}

// ── Colaboradoras ────────────────────────────────────────────────────────────

/**
 * Derive per-colaboradora movements from the live team statements. The current
 * month comes from `statementForMember` (generated = `totalAmount` → debit, paid
 * = `paidAmount` → credit). Prior months come from the deterministic
 * `paymentHistoryForMember` (count 5), each a settled month (the paid `amount`
 * booked as both generated and payment, so the historical balance returns to
 * zero).
 */
export function teamLedgerEntries(team: TeamLedgerSource): LedgerEntry[] {
  const out: LedgerEntry[] = []
  for (const member of team.members) {
    const movements: LedgerEntry[] = []

    const statement = team.statementForMember(member.id)
    if (statement && statement.totalAmount > 0) {
      const period = normalizePeriod(statement.month)
      movements.push({
        id: `led-${member.id}-${period}-generated`,
        entityType: 'teamMember',
        entityId: member.id,
        period,
        type: 'generated',
        referenceId: statement.id,
        // A payout has no lane of its own: `PayoutStatement` carries seven money columns
        // and no currency column, and `TeamMember.currency` is settable and read by
        // nothing. Pesos, stated rather than assumed — payroll lanes are their own work.
        currency: 'ARS',
        description: 'Liquidación del mes',
        debit: statement.totalAmount,
        credit: 0,
        balance: 0,
        date: statement.dueDate,
      })
      const paid = statement.paidAmount ?? 0
      if (paid > 0) {
        movements.push({
          id: `led-${member.id}-${period}-payment`,
          entityType: 'teamMember',
          entityId: member.id,
          period,
          type: 'payment',
          referenceId: statement.id,
          currency: 'ARS',
          description: 'Pago liquidación',
          debit: 0,
          credit: paid,
          balance: 0,
          date: statement.paidAt ?? statement.dueDate,
        })
      }
    }

    for (const record of team.paymentHistoryForMember(member.id)) {
      const period = `${record.iso.slice(0, 7)}-01`
      movements.push({
        id: `led-${record.id}-generated`,
        entityType: 'teamMember',
        entityId: member.id,
        period,
        type: 'generated',
        referenceId: record.id,
        currency: 'ARS',
        description: 'Liquidación del mes',
        debit: record.amount,
        credit: 0,
        balance: 0,
        date: record.iso,
      })
      movements.push({
        id: `led-${record.id}-payment`,
        entityType: 'teamMember',
        entityId: member.id,
        period,
        type: 'payment',
        referenceId: record.id,
        currency: 'ARS',
        description: `Pago liquidación (${record.method})`,
        debit: 0,
        credit: record.amount,
        balance: 0,
        date: record.iso,
      })
    }

    out.push(...withRunningBalance(movements))
  }
  return out
}

/** Distinct colaboradora entity ids that have at least one movement. */
export function teamEntityIds(team: TeamLedgerSource): string[] {
  return [...new Set(teamLedgerEntries(team).map((m) => m.entityId))]
}

/** Display name for a colaboradora id, resolved from the live team members. */
export function teamMemberName(members: TeamMember[], id: string): string {
  return members.find((m) => m.id === id)?.name ?? id
}

// ── Proveedores ──────────────────────────────────────────────────────────────

/**
 * Derive per-proveedor movements from the outgoing pagos (`/pagos`). Providers are
 * payees, so each payment yields a charge (`totalAmount` → debit) on its expected
 * date — the provider's invoice to the studio — and, when any amount was paid, a
 * payment (`paidAmount` → credit) on its payment date. Cancelled pagos are not a
 * live liability and are excluded. Movements are grouped by `recipientName` and
 * assigned a cumulative running balance.
 *
 * The grouping key is a NAME, and that is now the gap. `Payment` carries a real
 * `providerId` (added with the /pagos detail panels), and the server keeps its own
 * append-only ledger keyed by that uuid — which `/pagos` reads directly. This page
 * still derives its own movements in the browser, so the two can disagree: two
 * providers sharing a name collapse into one account here and stay separate there.
 * Migrating this page onto `GET /ledger` is its own item.
 */
export function providerLedgerEntries(payments: Payment[]): LedgerEntry[] {
  const byProvider = new Map<string, Payment[]>()
  for (const p of payments) {
    if (p.recipientType !== 'provider' || p.status === 'cancelled') continue
    const list = byProvider.get(p.recipientName) ?? []
    list.push(p)
    byProvider.set(p.recipientName, list)
  }

  const out: LedgerEntry[] = []
  for (const [entityId, list] of byProvider) {
    const movements: LedgerEntry[] = []
    for (const p of list) {
      const period = normalizePeriod(p.period)
      movements.push({
        id: `led-${p.id}-charge`,
        entityType: 'provider',
        entityId,
        period,
        type: 'charge',
        referenceId: p.id,
        currency: p.currency,
        description: p.concept,
        note: p.notes,
        debit: p.totalAmount,
        credit: 0,
        balance: 0,
        date: p.expectedDate,
      })
      if (p.paidAmount > 0) {
        movements.push({
          id: `led-${p.id}-payment`,
          entityType: 'provider',
          entityId,
          period,
          type: 'payment',
          referenceId: p.id,
          currency: p.currency,
          description: `Pago ${p.concept}`,
          debit: 0,
          credit: p.paidAmount,
          balance: 0,
          date: p.paymentDate ?? p.expectedDate,
        })
      }
    }
    out.push(...withRunningBalance(movements))
  }
  return out
}

/** Distinct proveedor entity ids (the recipient names) that have a movement. */
export function providerEntityIds(payments: Payment[]): string[] {
  return [...new Set(providerLedgerEntries(payments).map((m) => m.entityId))].sort()
}

/** All movements across every entity type. Client, colaboradora, and provider
 *  ledgers all derive from the live stores (Receivables / Team / Payments),
 *  passed in by `useAccountLedger`. */
export function allLedgerEntries(
  receivables: Receivable[],
  payments: Payment[],
  team: TeamLedgerSource,
): LedgerEntry[] {
  return [...clientLedgerEntries(receivables), ...teamLedgerEntries(team), ...providerLedgerEntries(payments)]
}

import type { Currency } from '@hold/shared'

import type { CollectionStatus } from './cobros-mock-data'
import type { TeamPaymentStatus } from './team-mock-data'

/** Which kind of account a ledger belongs to: receivables (client) and the two
 *  payee sides, colaboradoras (teamMember) and proveedores (provider). */
export type LedgerEntityType = 'client' | 'teamMember' | 'provider'

/**
 * A single movement on an account, per PRD §22.5. `debit` raises what is owed
 * (a client's invoice / a colaboradora's accrued liquidation); `credit` settles
 * it (a collection / a payment). `balance` is the running balance after the
 * movement.
 */
export type LedgerEntry = {
  id: string
  entityType: LedgerEntityType
  entityId: string
  period: string // 'YYYY-MM-01'
  type: 'charge' | 'collection' | 'generated' | 'payment' | 'adjustment'
  referenceId?: string // cobro / factura / pago id for deep-linking
  invoiceNumber?: string // factura asociada (client charges), when issued
  description: string
  note?: string // free-text note carried from the source record
  debit: number
  credit: number
  /**
   * The lane this movement is in — the source row's own, never assumed.
   *
   * The entry had no lane at all, so `withRunningBalance` ran one accumulator over all
   * of them and every figure rendered through the peso formatter. A client with a peso
   * cobro and a dollar cobro got a saldo that subtracts dollars from pesos.
   */
  currency: Currency
  /** The running balance WITHIN this entry's lane, never across lanes. */
  balance: number
  date: string // ISO 'YYYY-MM-DD'
}

/** The statement status vocabulary, reusing the source enums (client = collection
 *  side; teamMember and provider = payment side). */
export type AccountStatus = CollectionStatus | TeamPaymentStatus

/** One row of an entity's master list. */
export type AccountEntity = {
  entityType: LedgerEntityType
  entityId: string
  name: string
  /** The PESO running balance. A ledger holds one per lane; this is the one a single
   *  column can show, and `otherLaneCount` says what it leaves out. */
  currentBalance: number
  /** Movements in another lane, which `currentBalance` does not describe. */
  otherLaneCount: number
  status: AccountStatus
  lastMovementAt?: string
}

/** One period's rolled-up summary plus the movements that compose it. */
export type PeriodStatement = {
  period: string // 'YYYY-MM-01'
  charged: number // facturado (client) / generado (teamMember), PESO lane
  settled: number // cobrado (client) / pagado (teamMember), PESO lane
  balance: number // cumulative PESO running balance at period end
  /**
   * Movements in the period that the three figures above do not describe.
   *
   * They are peso-scoped: `charged` and `settled` used to add every lane together, and
   * `balance` read the last movement's running total whatever lane it was in. One number
   * cannot describe three units, and `/pagos` and `/cobros` are where the per-lane totals
   * live. Here the omission is counted so the statement does not read as a smaller one.
   */
  otherLaneCount: number
  status: AccountStatus
  dueDate?: string
  reference?: string // factura asociada (client) / concepto (teamMember)
  notes?: string
  movements: LedgerEntry[]
}

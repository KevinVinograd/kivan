/**
 * Finance bridge — derives Operación mensual's per-client COLLECTION (cobros, B-1a)
 * and per-member PAYOUT (pagos, B-1b) actuals from the canonical ReceivablesProvider
 * / PaymentsProvider (the actuals-shared model).
 *
 * The month keeps owning the PLAN (client: monthlyFee/extras/productionsAmount;
 * member: base/productions/viatics/adjustments), `invoiceStatus`, `statementStatus`,
 * `bank` and all cost/margin/lifecycle. The canonical stores own the actuals:
 * Receivable owns collection (collectedAmount + status); Payment owns payout
 * (paidAmount + status). `overlayClientCollection` / `overlayTeamPayout` project the
 * actuals onto each row that resolves for the month's period; `allocateClientCollection`
 * / `allocateTeamPayment` are the write side used when a cobro/pago is registered in
 * the close. Rows with no canonical match (orphans) are left untouched — month-owned.
 *
 * Pure functions only (no React, no store access). Joins are by normalized name +
 * period (client by `clientName`; member by `recipientName`, restricted to the team
 * recipient types); real `clientId`/`recipientId` FKs are a tracked follow-up.
 */
import { apiDateToCalendarDay } from '@/app/lib/iso-date'
import type { CollectionStatus, Receivable } from './cobros-mock-data'
import type { Payment } from './pagos-mock-data'
import type { MonthlyOperationData, MoPaymentStatus, PayoutStatus } from './monthly-operation-mock-data'

/** Tolerant client-name key for joining across stores (trim + lowercase). */
function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}

/** The receivables `period` ('YYYY-MM-01') a monthly `MonthId` ('YYYY-MM') maps to. */
export function monthPeriod(monthId: string): string {
  return `${monthId}-01`
}

/**
 * Active receivables for a client in a period, matched by normalized name + period.
 * Cancelled rows are excluded: a client whose only canonical match is cancelled
 * resolves to none and falls back to its month-owned collection (orphan).
 */
export function clientReceivables(
  receivables: Receivable[],
  clientName: string,
  period: string,
): Receivable[] {
  const key = normalizeName(clientName)
  return receivables.filter(
    (r) => normalizeName(r.clientName) === key && r.period === period && r.status !== 'cancelled',
  )
}

/**
 * Aggregate the collection status of a client's receivables into the monthly
 * `MoPaymentStatus`. Cancelled rows are excluded. `paid` when everything owed is
 * collected, `partial` when some is, `overdue` when nothing is collected and any
 * row is past due, else `pending`.
 */
export function aggregateCollectionStatus(rows: Receivable[]): MoPaymentStatus {
  const active = rows.filter((r) => r.status !== 'cancelled')
  const collected = active.reduce((sum, r) => sum + r.collectedAmount, 0)
  const total = active.reduce((sum, r) => sum + r.totalAmount, 0)
  if (collected > 0 && collected >= total && total > 0) return 'paid'
  if (collected > 0) return 'partial'
  if (active.some((r) => r.status === 'overdue')) return 'overdue'
  return 'pending'
}

/** Sum of collected amounts across a client's non-cancelled receivables. */
function collectedTotal(rows: Receivable[]): number {
  return rows.filter((r) => r.status !== 'cancelled').reduce((sum, r) => sum + r.collectedAmount, 0)
}

/** Latest collection date (YYYY-MM-DD) among non-cancelled receivables with collection, else
 *  undefined. Reads `collectedAt` — the day the operator entered — falling back to
 *  `lastActivityAt` (the row's createdAt) only for rows collected before that column shipped.
 *  It read the fallback for everything, so the screen that CAPTURES the collection date
 *  rendered a different one back. `latestPayoutDate` below already reads the real field. */
function latestCollectionDate(rows: Receivable[]): string | undefined {
  const dates = rows
    .filter((r) => r.status !== 'cancelled' && r.collectedAmount > 0)
    // Reduced to calendar days BEFORE the max. Mixing a date-only `collectedAt` with a
    // full-instant `lastActivityAt` and comparing lexicographically lets one legacy row's
    // createdAt outrank every real collection date, reporting a day nothing was collected.
    .map((r) => r.collectedAt ?? r.lastActivityAt)
    // Filtered BEFORE the helper: a row with neither date would reach it as undefined and
    // throw, unwinding the whole Operación mensual render. The previous plain map tolerated
    // it, so hardening the date must not trade a wrong day for a blank screen.
    .filter((iso): iso is string => Boolean(iso))
    .map(apiDateToCalendarDay)
  if (dates.length === 0) return undefined
  return dates.reduce((a, b) => (a > b ? a : b))
}

/**
 * Overlay canonical collection onto the clients that resolve to a receivable for
 * `period`. Only `paidAmount` / `paymentStatus` / `paymentDate` are replaced; owed
 * components and `invoiceStatus` are preserved. Orphans (no matching receivable)
 * are returned unchanged so they stay month-owned. Pure — returns a new
 * `MonthlyOperationData`, never mutates the input.
 */
export function overlayClientCollection(
  data: MonthlyOperationData,
  receivables: Receivable[],
  period: string,
): MonthlyOperationData {
  return {
    ...data,
    clients: data.clients.map((client) => {
      const rows = clientReceivables(receivables, client.name, period)
      if (rows.length === 0) return client
      return {
        ...client,
        paidAmount: collectedTotal(rows),
        paymentStatus: aggregateCollectionStatus(rows),
        paymentDate: latestCollectionDate(rows),
      }
    }),
  }
}

/**
 * Allocate a registered collection `amount` across a client's receivables, oldest
 * `dueDate` first, clamped to each row's outstanding balance. Returns ONLY the
 * receivables that changed (already updated) — commit each via `applyReceivable`.
 * Cancelled rows are skipped. Any remainder beyond total outstanding is dropped.
 */
export function allocateClientCollection(
  rows: Receivable[],
  amount: number,
  date: string,
): Receivable[] {
  const ordered = rows
    .filter((r) => r.status !== 'cancelled')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  let remaining = amount
  const changed: Receivable[] = []
  for (const row of ordered) {
    if (remaining <= 0) break
    const outstanding = row.totalAmount - row.collectedAmount
    if (outstanding <= 0) continue
    const applied = Math.min(remaining, outstanding)
    remaining -= applied
    const collectedAmount = row.collectedAmount + applied
    const status: CollectionStatus = collectedAmount >= row.totalAmount ? 'collected' : 'partial'
    changed.push({
      ...row,
      collectedAmount,
      status,
      lastActivityLabel: status === 'collected' ? 'Pago registrado' : 'Pago parcial registrado',
      lastActivityAt: `${date}T12:00:00`,
    })
  }
  return changed
}

// ── Team / pagos (B-1b) ──────────────────────────────────────────────────────

/** Recipient types that correspond to an Operación mensual team payout. */
const TEAM_RECIPIENT_TYPES = new Set<Payment['recipientType']>(['collaborator', 'employee'])

/**
 * Active payments to a team member in a period, matched by normalized name + period
 * + team type. Cancelled rows are excluded: a member whose only canonical match is
 * cancelled resolves to none and falls back to their month-owned payout (orphan).
 */
export function teamMemberPayments(
  payments: Payment[],
  recipientName: string,
  period: string,
): Payment[] {
  const key = normalizeName(recipientName)
  return payments.filter(
    (p) =>
      normalizeName(p.recipientName) === key &&
      p.period === period &&
      p.status !== 'cancelled' &&
      TEAM_RECIPIENT_TYPES.has(p.recipientType),
  )
}

/**
 * Aggregate the payment status of a member's payments into the monthly
 * `PayoutStatus`. Cancelled rows are excluded. `paid` when everything owed is paid,
 * `partial` when some is, else `pending`. Note: `PayoutStatus` has no `overdue`.
 */
export function aggregatePayoutStatus(rows: Payment[]): PayoutStatus {
  const active = rows.filter((p) => p.status !== 'cancelled')
  const paid = active.reduce((sum, p) => sum + p.paidAmount, 0)
  const total = active.reduce((sum, p) => sum + p.totalAmount, 0)
  if (paid > 0 && paid >= total && total > 0) return 'paid'
  if (paid > 0) return 'partial'
  return 'pending'
}

/** Sum of paid amounts across a member's non-cancelled payments. */
function paidTotal(rows: Payment[]): number {
  return rows.filter((p) => p.status !== 'cancelled').reduce((sum, p) => sum + p.paidAmount, 0)
}

/** Latest payment date (YYYY-MM-DD) among a member's non-cancelled paid payments, else undefined. */
function latestPayoutDate(rows: Payment[]): string | undefined {
  const dates = rows
    .filter((p) => p.status !== 'cancelled' && p.paidAmount > 0 && p.paymentDate)
    .map((p) => p.paymentDate as string)
  if (dates.length === 0) return undefined
  return dates.reduce((a, b) => (a > b ? a : b)).slice(0, 10)
}

/**
 * Overlay canonical payout onto the team members that resolve to a payment for
 * `period`. Only `paidAmount` / `payoutStatus` / `payoutDate` are replaced; the
 * payout plan (base/productions/viatics/adjustments), `statementStatus` and `bank`
 * are preserved. Orphans (no matching payment) are returned unchanged so they stay
 * month-owned. Pure — returns a new `MonthlyOperationData`, never mutates the input.
 */
export function overlayTeamPayout(
  data: MonthlyOperationData,
  payments: Payment[],
  period: string,
): MonthlyOperationData {
  return {
    ...data,
    team: data.team.map((payout) => {
      const rows = teamMemberPayments(payments, payout.name, period)
      if (rows.length === 0) return payout
      return {
        ...payout,
        paidAmount: paidTotal(rows),
        payoutStatus: aggregatePayoutStatus(rows),
        payoutDate: latestPayoutDate(rows),
      }
    }),
  }
}

/**
 * Allocate a registered payout `amount` across a member's payments, oldest
 * `expectedDate` first, clamped to each row's outstanding balance. Returns ONLY the
 * payments that changed (already updated) — commit each via `applyPayment`.
 * Cancelled rows are skipped. Any remainder beyond total outstanding is dropped.
 */
export function allocateTeamPayment(rows: Payment[], amount: number, date: string): Payment[] {
  const ordered = rows
    .filter((p) => p.status !== 'cancelled')
    .sort((a, b) => a.expectedDate.localeCompare(b.expectedDate))
  let remaining = amount
  const changed: Payment[] = []
  for (const row of ordered) {
    if (remaining <= 0) break
    const outstanding = row.totalAmount - row.paidAmount
    if (outstanding <= 0) continue
    const applied = Math.min(remaining, outstanding)
    remaining -= applied
    const paidAmount = row.paidAmount + applied
    const status: Payment['status'] = paidAmount >= row.totalAmount ? 'paid' : 'partial'
    changed.push({
      ...row,
      paidAmount,
      status,
      paymentDate: date,
      lastActivityLabel: status === 'paid' ? 'Pago realizado' : 'Pago parcial registrado',
      lastActivityAt: `${date}T12:00:00`,
    })
  }
  return changed
}

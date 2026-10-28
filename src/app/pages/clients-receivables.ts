/**
 * Joins a client row to the CANONICAL receivables for the month.
 *
 * `/clientes` used to fabricate its money in `dtoToClient`: every successful fetch
 * hardcoded `paymentStatus: 'pending'`, `currentMonthPaidAmount: 0`,
 * `currentMonthDueAmount: monthlyFee`, `invoiceStatus: 'not_issued'`. The client DTO
 * carries none of those — a client's money per month lives on **receivables**, one per
 * service, and `ReceivablesProvider` already holds them app-wide.
 *
 * This module reads that store; it does not fetch and does not own anything. The
 * page-context forbids forking a second
 * receivables store here, and joining to the one that exists is the opposite of forking.
 *
 * Pure functions only (no React, no store access).
 */
import { currentPeriod } from '@/app/lib/periods'
import { todayIso } from '@/app/lib/iso-date'
import type { Receivable } from './cobros-mock-data'
import type { Client, InvoiceStatus, PaymentStatus } from './clients-mock-data'

/** What the client's month looks like once its receivables are read. */
export type ClientMonth = {
  /** The month's receivables for this client, oldest due date first. */
  receivables: Receivable[]
  /** Sum of the rows' totals — what is actually billed, not the contracted fee. */
  due: number
  /** Sum of what has been collected against them. */
  paid: number
  paymentStatus: PaymentStatus
  invoiceStatus: InvoiceStatus
  /** Latest collection date across the rows, when anything has been collected. */
  lastPaymentDate?: string
}

/**
 * A cancelled receivable is not money owed. It stays in the store (Cobros shows it as
 * cancelled) but it must not add to what the client owes, or a voided cobro would keep
 * the client reading as "en mora" forever.
 */
function isLive(receivable: Receivable): boolean {
  return receivable.status !== 'cancelled'
}

/**
 * The month's rows for one client.
 *
 * Matched on `clientId`. It used to be impossible to do this correctly from the front
 * because the DTO mapping dropped the id and only kept `clientName` — a name match is
 * wrong the moment two clients read alike or one is renamed, and here it would attach
 * another client's money to this row.
 */
export function receivablesForClient(
  receivables: Receivable[],
  clientId: string,
  period: string = currentPeriod(),
): Receivable[] {
  return receivables
    .filter((r) => isLive(r) && r.clientId === clientId && r.period.slice(0, 7) === period.slice(0, 7))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
}

/**
 * Aggregate payment state across the month's rows.
 *
 * `overdue` comes from the rows' real `dueDate` against today — it used to be a
 * hardcoded literal, so no client could ever become overdue by the calendar moving.
 */
function derivePaymentStatus(rows: Receivable[], due: number, paid: number, today: string): PaymentStatus {
  if (due > 0 && paid >= due) return 'paid'
  const anyOverdue = rows.some((r) => r.collectedAmount < r.totalAmount && r.dueDate.slice(0, 10) < today)
  if (anyOverdue) return 'overdue'
  return paid > 0 ? 'partial' : 'pending'
}

/**
 * Aggregate invoice state. Deliberately pessimistic: with several rows the client is
 * only "issued" once EVERY live row has a factura. Reporting the best row's state would
 * let a client with one invoiced service out of three read as fully invoiced.
 */
function deriveInvoiceStatus(rows: Receivable[]): InvoiceStatus {
  if (rows.length === 0) return 'not_issued'
  const issued = rows.filter((r) => r.billingStatus !== 'no_invoice' && r.billingStatus !== 'pending')
  if (issued.length < rows.length) return 'not_issued'
  return issued.every((r) => r.billingStatus === 'sent') ? 'sent' : 'issued'
}

/**
 * The client's month, or `undefined` when nothing was billed to them.
 *
 * `undefined` is a state the UI must render, not a zero to substitute: `$0` reads as a
 * real amount owed to nobody, and falling back to `monthlyFee` would re-invent exactly
 * the number this replaced — the contracted fee is not evidence that anyone billed it.
 */
export function clientMonth(
  receivables: Receivable[],
  clientId: string,
  period: string = currentPeriod(),
  today: string = todayIso(),
): ClientMonth | undefined {
  const rows = receivablesForClient(receivables, clientId, period)
  if (rows.length === 0) return undefined
  const due = rows.reduce((sum, r) => sum + r.totalAmount, 0)
  const paid = rows.reduce((sum, r) => sum + r.collectedAmount, 0)
  const collectedDates = rows
    .filter((r) => r.collectedAmount > 0)
    .map((r) => r.collectedAt ?? r.lastActivityAt)
    .filter((d): d is string => Boolean(d))
    .sort()
  return {
    receivables: rows,
    due,
    paid,
    paymentStatus: derivePaymentStatus(rows, due, paid, today),
    invoiceStatus: deriveInvoiceStatus(rows),
    lastPaymentDate: collectedDates.length ? collectedDates[collectedDates.length - 1].slice(0, 10) : undefined,
  }
}

/** Project the month onto the client row, so every consumer reads real money. */
export function withMonth(client: Client, month: ClientMonth | undefined): Client {
  if (!month) return client
  return {
    ...client,
    currentMonthDueAmount: month.due,
    currentMonthPaidAmount: month.paid,
    paymentStatus: month.paymentStatus,
    invoiceStatus: month.invoiceStatus,
    lastPaymentDate: month.lastPaymentDate ?? client.lastPaymentDate,
  }
}

/** Rows a collection can still be registered against (something is outstanding). */
export function collectable(rows: Receivable[]): Receivable[] {
  return rows.filter((r) => r.collectedAmount < r.totalAmount)
}

/** Rows that have no factura yet. */
export function invoiceable(rows: Receivable[]): Receivable[] {
  return rows.filter((r) => r.billingStatus === 'no_invoice' || r.billingStatus === 'pending')
}

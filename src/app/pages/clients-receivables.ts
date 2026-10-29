import { currentPeriod } from '@/app/lib/periods'
import { todayIso } from '@/app/lib/iso-date'
import type { Receivable } from './cobros-mock-data'
import type { Client, InvoiceStatus, PaymentStatus } from './clients-mock-data'

export type ClientMonth = {
  receivables: Receivable[]
  due: number
  paid: number
  paymentStatus: PaymentStatus
  invoiceStatus: InvoiceStatus
  lastPaymentDate?: string
}

function isLive(receivable: Receivable): boolean {
  return receivable.status !== 'cancelled'
}

export function receivablesForClient(
  receivables: Receivable[],
  clientId: string,
  period: string = currentPeriod(),
): Receivable[] {
  return receivables
    .filter((r) => isLive(r) && r.clientId === clientId && r.period.slice(0, 7) === period.slice(0, 7))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
}

function derivePaymentStatus(rows: Receivable[], due: number, paid: number, today: string): PaymentStatus {
  if (due > 0 && paid >= due) return 'paid'
  const anyOverdue = rows.some((r) => r.collectedAmount < r.totalAmount && r.dueDate.slice(0, 10) < today)
  if (anyOverdue) return 'overdue'
  return paid > 0 ? 'partial' : 'pending'
}

function deriveInvoiceStatus(rows: Receivable[]): InvoiceStatus {
  if (rows.length === 0) return 'not_issued'
  const issued = rows.filter((r) => r.billingStatus !== 'no_invoice' && r.billingStatus !== 'pending')
  if (issued.length < rows.length) return 'not_issued'
  return issued.every((r) => r.billingStatus === 'sent') ? 'sent' : 'issued'
}

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

export function collectable(rows: Receivable[]): Receivable[] {
  return rows.filter((r) => r.collectedAmount < r.totalAmount)
}

export function invoiceable(rows: Receivable[]): Receivable[] {
  return rows.filter((r) => r.billingStatus === 'no_invoice' || r.billingStatus === 'pending')
}

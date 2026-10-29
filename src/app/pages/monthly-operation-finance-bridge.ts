import { apiDateToCalendarDay } from '@/app/lib/iso-date'
import type { CollectionStatus, Receivable } from './cobros-mock-data'
import type { Payment } from './pagos-mock-data'
import type { MonthlyOperationData, MoPaymentStatus, PayoutStatus } from './monthly-operation-mock-data'

function normalizeName(name: string): string {
  return name.trim().toLowerCase()
}

export function monthPeriod(monthId: string): string {
  return `${monthId}-01`
}

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

export function aggregateCollectionStatus(rows: Receivable[]): MoPaymentStatus {
  const active = rows.filter((r) => r.status !== 'cancelled')
  const collected = active.reduce((sum, r) => sum + r.collectedAmount, 0)
  const total = active.reduce((sum, r) => sum + r.totalAmount, 0)
  if (collected > 0 && collected >= total && total > 0) return 'paid'
  if (collected > 0) return 'partial'
  if (active.some((r) => r.status === 'overdue')) return 'overdue'
  return 'pending'
}

function collectedTotal(rows: Receivable[]): number {
  return rows.filter((r) => r.status !== 'cancelled').reduce((sum, r) => sum + r.collectedAmount, 0)
}

function latestCollectionDate(rows: Receivable[]): string | undefined {
  const dates = rows
    .filter((r) => r.status !== 'cancelled' && r.collectedAmount > 0)
    .map((r) => r.collectedAt ?? r.lastActivityAt)
    .filter((iso): iso is string => Boolean(iso))
    .map(apiDateToCalendarDay)
  if (dates.length === 0) return undefined
  return dates.reduce((a, b) => (a > b ? a : b))
}

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

const TEAM_RECIPIENT_TYPES = new Set<Payment['recipientType']>(['collaborator', 'employee'])

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

export function aggregatePayoutStatus(rows: Payment[]): PayoutStatus {
  const active = rows.filter((p) => p.status !== 'cancelled')
  const paid = active.reduce((sum, p) => sum + p.paidAmount, 0)
  const total = active.reduce((sum, p) => sum + p.totalAmount, 0)
  if (paid > 0 && paid >= total && total > 0) return 'paid'
  if (paid > 0) return 'partial'
  return 'pending'
}

function paidTotal(rows: Payment[]): number {
  return rows.filter((p) => p.status !== 'cancelled').reduce((sum, p) => sum + p.paidAmount, 0)
}

function latestPayoutDate(rows: Payment[]): string | undefined {
  const dates = rows
    .filter((p) => p.status !== 'cancelled' && p.paidAmount > 0 && p.paymentDate)
    .map((p) => p.paymentDate as string)
  if (dates.length === 0) return undefined
  return dates.reduce((a, b) => (a > b ? a : b)).slice(0, 10)
}

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

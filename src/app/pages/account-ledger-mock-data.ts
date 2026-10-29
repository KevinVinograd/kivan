import type { Currency } from '@hold/shared'

import { type Receivable } from './cobros-mock-data'
import type {
  MonthlyTeamStatement,
  TeamMember,
  TeamPaymentRecord,
} from './team-mock-data'
import { type Payment } from './pagos-mock-data'
import type { LedgerEntry } from './account-ledger-types'

export type TeamLedgerSource = {
  members: TeamMember[]
  statementForMember: (id: string) => MonthlyTeamStatement | undefined
  paymentHistoryForMember: (id: string) => TeamPaymentRecord[]
}

function normalizePeriod(p: string): string {
  return p.length === 7 ? `${p}-01` : p
}

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

function clientKey(r: Receivable): string {
  return r.clientName
}

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

export function clientEntityIds(receivables: Receivable[]): string[] {
  return [...new Set(clientLedgerEntries(receivables).map((m) => m.entityId))].sort()
}

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

export function teamEntityIds(team: TeamLedgerSource): string[] {
  return [...new Set(teamLedgerEntries(team).map((m) => m.entityId))]
}

export function teamMemberName(members: TeamMember[], id: string): string {
  return members.find((m) => m.id === id)?.name ?? id
}

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

export function providerEntityIds(payments: Payment[]): string[] {
  return [...new Set(providerLedgerEntries(payments).map((m) => m.entityId))].sort()
}

export function allLedgerEntries(
  receivables: Receivable[],
  payments: Payment[],
  team: TeamLedgerSource,
): LedgerEntry[] {
  return [...clientLedgerEntries(receivables), ...teamLedgerEntries(team), ...providerLedgerEntries(payments)]
}

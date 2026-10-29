import {
  addMonths,
  addWeeks,
  differenceInCalendarWeeks,
  format,
  isAfter,
  isBefore,
  parseISO,
  setDate,
  startOfISOWeek,
} from 'date-fns'

import { buildPool, claim, isLinked, type Occurrence } from './treasury-netting'
import type {
  CashAccount,
  CommittedCategory,
  CommittedItem,
  Currency,
  LinkedEntityType,
} from './treasury-mock-data'
import type { Receivable } from './cobros-mock-data'
import type { Payment, RecipientType } from './pagos-mock-data'

export type CashflowBasis = 'actual' | 'committed' | 'projected'

export type CashflowLine = {
  category: CommittedCategory | 'collection' | 'payment'
  direction: 'inflow' | 'outflow'
  amount: number
  basis: CashflowBasis
}

export type CashflowWeek = {
  weekStart: string
  weekIndex: number
  opening: number
  inflows: number
  outflows: number
  closing: number
  isBelowZero: boolean
  lines: CashflowLine[]
}

const ISO = 'yyyy-MM-dd'

export function buildWeeks(asOf: string, weeks = 13): CashflowWeek[] {
  const first = startOfISOWeek(parseISO(asOf))
  return Array.from({ length: weeks }, (_, weekIndex) => ({
    weekStart: format(addWeeks(first, weekIndex), ISO),
    weekIndex,
    opening: 0,
    inflows: 0,
    outflows: 0,
    closing: 0,
    isBelowZero: false,
    lines: [],
  }))
}

export function weekIndexOf(dateISO: string, firstWeekStart: Date, weeks: number): number {
  const wkStart = startOfISOWeek(parseISO(dateISO))
  const idx = differenceInCalendarWeeks(wkStart, firstWeekStart, { weekStartsOn: 1 })
  return idx >= 0 && idx < weeks ? idx : -1
}

const STEP_MONTHS = { monthly: 1, quarterly: 3, annual: 12 } as const

function onAnchor(monthDate: Date, anchorDay: number): Date {
  return setDate(monthDate, Math.min(Math.max(anchorDay, 1), 28))
}

export function expandCommitment(
  item: CommittedItem,
  windowStart: Date,
  windowEnd: Date,
): Date[] {
  if (!item.isActive) return []
  const horizonEnd = item.endDate ? parseISO(item.endDate) : windowEnd
  const start = parseISO(item.startDate)

  if (item.recurrence === 'one_time') {
    const d = onAnchor(start, item.anchorDay)
    const inWindow = !isBefore(d, windowStart) && !isAfter(d, windowEnd)
    return inWindow && !isAfter(d, horizonEnd) ? [d] : []
  }

  const step = STEP_MONTHS[item.recurrence]
  const occ: Date[] = []
  let cursor = onAnchor(start, item.anchorDay)
  while (isBefore(cursor, windowStart)) cursor = onAnchor(addMonths(cursor, step), item.anchorDay)
  while (!isAfter(cursor, windowEnd) && !isAfter(cursor, horizonEnd)) {
    if (!isBefore(cursor, start)) occ.push(cursor)
    cursor = onAnchor(addMonths(cursor, step), item.anchorDay)
  }
  return occ
}

export type EntityRef = { type: LinkedEntityType; id: string }

export type DatedLine = CashflowLine & {
  date: string
  entity?: EntityRef
}

export function actualOutflowCategory(recipientType: RecipientType): CommittedCategory {
  switch (recipientType) {
    case 'collaborator':
    case 'employee':
      return 'salaries'
    case 'fixed_expense':
      return 'fixed_expense'
    case 'monotributo':
      return 'tax'
    case 'platform':
      return 'platform'
    case 'provider':
      return 'other'
  }
}

export function receivableLines(receivables: Receivable[]): DatedLine[] {
  const lines: DatedLine[] = []
  for (const r of receivables) {
    if (r.status === 'cancelled') continue
    const entity: EntityRef | undefined = r.clientId ? { type: 'client', id: r.clientId } : undefined
    if (r.collectedAmount > 0) {
      lines.push({
        category: 'collection',
        direction: 'inflow',
        amount: r.collectedAmount,
        basis: 'actual',
        date: r.collectedAt ?? r.dueDate,
        ...(entity ? { entity } : {}),
      })
    }
    const outstanding = r.totalAmount - r.collectedAmount
    if (outstanding > 0) {
      lines.push({
        category: 'collection',
        direction: 'inflow',
        amount: outstanding,
        basis: 'projected',
        date: r.dueDate,
        ...(entity ? { entity } : {}),
      })
    }
  }
  return lines
}

export function paymentEntity(p: Payment): EntityRef | undefined {
  if (p.teamMemberId) return { type: 'teamMember', id: p.teamMemberId }
  if (p.providerId) return { type: 'provider', id: p.providerId }
  if (p.invoiceEmitterId) return { type: 'invoiceEmitter', id: p.invoiceEmitterId }
  return undefined
}

export function paymentLines(payments: Payment[]): DatedLine[] {
  const lines: DatedLine[] = []
  for (const p of payments) {
    if (p.status === 'cancelled') continue
    const category = actualOutflowCategory(p.recipientType)
    const entity = paymentEntity(p)
    if (p.paidAmount > 0) {
      lines.push({
        category,
        direction: 'outflow',
        amount: p.paidAmount,
        basis: 'actual',
        date: p.paymentDate ?? p.expectedDate,
        ...(entity ? { entity } : {}),
      })
    }
    const outstanding = p.totalAmount - p.paidAmount
    if (outstanding > 0) {
      lines.push({
        category,
        direction: 'outflow',
        amount: outstanding,
        basis: 'projected',
        date: p.expectedDate,
        ...(entity ? { entity } : {}),
      })
    }
  }
  return lines
}

export type ProjectCashflowInput = {
  account: CashAccount
  receivables: Receivable[]
  payments: Payment[]
  commitments: CommittedItem[]
  asOf: string
  weeks?: number
  currency?: Currency
}

export function projectCashflow(input: ProjectCashflowInput): CashflowWeek[] {
  const { account, receivables, payments, commitments, asOf } = input
  const weekCount = input.weeks ?? 13
  const currency = input.currency ?? 'ARS'
  const weeks = buildWeeks(asOf, weekCount)
  const firstWeekStart = startOfISOWeek(parseISO(asOf))
  const windowStart = firstWeekStart
  const windowEnd = addWeeks(windowStart, weekCount)

  const place = (line: CashflowLine, dateISO: string) => {
    const idx = weekIndexOf(dateISO, firstWeekStart, weekCount)
    if (idx >= 0) weeks[idx].lines.push(line)
  }

  const datedActualsAndExpected = [
    ...receivableLines(receivables.filter((r) => r.currency === currency)),
    ...paymentLines(payments.filter((p) => p.currency === currency)),
  ]
  for (const line of datedActualsAndExpected) {
    const { date, entity: _entity, ...rest } = line
    place(rest, date)
  }

  const inWindow = (dateISO: string) => weekIndexOf(dateISO, firstWeekStart, weekCount) >= 0
  const pool = buildPool(datedActualsAndExpected, inWindow)

  const occurrences: Occurrence[] = []
  for (const item of commitments) {
    if (item.currency !== currency) continue
    for (const at of expandCommitment(item, windowStart, windowEnd)) {
      const idx = weekIndexOf(format(at, ISO), firstWeekStart, weekCount)
      if (idx >= 0) occurrences.push({ item, at, idx })
    }
  }
  occurrences.sort((a, b) => a.at.getTime() - b.at.getTime())

  const linkedFirst = [...occurrences.filter((o) => isLinked(o.item)), ...occurrences.filter((o) => !isLinked(o.item))]

  for (const occ of linkedFirst) {
    const needed = claim(occ, pool, isLinked(occ.item))
    if (needed === 0) continue
    weeks[occ.idx].lines.push({
      category: occ.item.category,
      direction: occ.item.direction,
      amount: needed,
      basis: occ.item.confidence,
    })
  }

  let running = account.openingBalance
  for (const wk of weeks) {
    wk.opening = running
    wk.inflows = wk.lines.filter((l) => l.direction === 'inflow').reduce((s, l) => s + l.amount, 0)
    wk.outflows = wk.lines.filter((l) => l.direction === 'outflow').reduce((s, l) => s + l.amount, 0)
    wk.closing = wk.opening + wk.inflows - wk.outflows
    wk.isBelowZero = wk.closing < 0
    running = wk.closing
  }

  return weeks
}

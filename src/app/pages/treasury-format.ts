/**
 * Cashflow projection engine (pure). Rolls a running cash balance across a
 * 13-week ISO-week window from an opening balance + the canonical cobros/pagos
 * actuals + the treasury committed-items register. No React, no I/O, no
 * mutation of the canonical stores — it overlays and derives. ARS-only (v1).
 */
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
  /** ISO 'YYYY-MM-DD' Monday of the week. */
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

/** Clamp to anchorDay; type guarantees 1–28 but guard defensively. */
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
  // Skip occurrences before the window, preserving the startDate cadence.
  while (isBefore(cursor, windowStart)) cursor = onAnchor(addMonths(cursor, step), item.anchorDay)
  while (!isAfter(cursor, windowEnd) && !isAfter(cursor, horizonEnd)) {
    if (!isBefore(cursor, start)) occ.push(cursor)
    cursor = onAnchor(addMonths(cursor, step), item.anchorDay)
  }
  return occ
}

/** The counterparty a money record names, when it names one. */
export type EntityRef = { type: LinkedEntityType; id: string }

export type DatedLine = CashflowLine & {
  date: string
  /**
   * Who this money is with. It is what lets an occurrence be superseded by the
   * record that REALIZES it instead of by any record that merely shares its week
   * and category. Absent for a gasto fijo / monotributo / plataforma payment: those
   * have no counterparty record, so nothing can be matched to them.
   */
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
    // A cobro belongs to its client, and that id is the whole reason the projection
    // can tell "the abono was paid" from "some money came in that week".
    const entity: EntityRef | undefined = r.clientId ? { type: 'client', id: r.clientId } : undefined
    if (r.collectedAmount > 0) {
      lines.push({
        category: 'collection',
        direction: 'inflow',
        amount: r.collectedAmount,
        basis: 'actual',
        // The day the cash ARRIVED. It used to be `lastActivityAt`, which the mapper
        // sets to the row's `createdAt`, so realized money landed in the week the cobro
        // was OPENED. `paymentLines` has always read `paymentDate`; this was the
        // asymmetric half. The fallback mirrors that same line: when the collection day
        // was never recorded (only rows collected before the column existed), the
        // expected day is a stated expectation rather than an invented date.
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

/**
 * The counterparty a pago names, mirroring `Payment`'s own polymorphic contract:
 * `teamMemberId` for a colaboradora / empleada, `providerId` for a proveedor — and now
 * also for the gasto fijo or plataforma that names who it is paid TO — and
 * `invoiceEmitterId` for a monotributo cuota.
 *
 * The two halves still agree, which is the property that matters: a pago carries an id
 * exactly where a commitment can name one. What changed is that the set is no longer
 * three categories short. A pago that names nobody (a bank fee, an old row) still
 * returns undefined, and its occurrence nets on the coarse category key.
 *
 * Order matters only in that the ids are mutually exclusive in practice; `teamMemberId`
 * is checked first because it is the only one the ledger also keys on.
 */
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
  /** Currency lane to project (default ARS). Cobros, pagos and commitments are all
   *  filtered to it: a record in another lane is another lane's projection, never this
   *  one's at face value. */
  currency?: Currency
}

export function projectCashflow(input: ProjectCashflowInput): CashflowWeek[] {
  const { account, receivables, payments, commitments, asOf } = input
  const weekCount = input.weeks ?? 13
  const currency = input.currency ?? 'ARS'
  const weeks = buildWeeks(asOf, weekCount)
  const firstWeekStart = startOfISOWeek(parseISO(asOf))
  const windowStart = firstWeekStart
  // Exclusive upper bound = Monday after the last week. expandCommitment may emit
  // an occurrence on that exact boundary; weekIndexOf's range guard (idx < weekCount)
  // drops it, so every in-window occurrence is kept and none leak past week 12.
  const windowEnd = addWeeks(windowStart, weekCount)

  const place = (line: CashflowLine, dateISO: string) => {
    const idx = weekIndexOf(dateISO, firstWeekStart, weekCount)
    if (idx >= 0) weeks[idx].lines.push(line)
  }

  // 1. Actual + expected lines from the canonical stores, SCOPED TO THE LANE BEING
  //    PROJECTED. This read `currency === 'ARS' ? ... : []` on the premise that the
  //    canonical cobros/pagos were ARS-only. They are not: a pago is recorded in the lane
  //    the money left in, and a cobro is billed in its client's lane. The premise failing
  //    cost both halves at once — a dollar pago became a PESO outflow in the ARS
  //    projection, and the dollar lane projected from its manual commitments alone as
  //    though no dollar had ever moved.
  const datedActualsAndExpected = [
    ...receivableLines(receivables.filter((r) => r.currency === currency)),
    ...paymentLines(payments.filter((p) => p.currency === currency)),
  ]
  for (const line of datedActualsAndExpected) {
    // `entity` is matching metadata, not part of the week's rendered line.
    const { date, entity: _entity, ...rest } = line
    place(rest, date)
  }

  // 2. The money the canonical stores already account for, as a consumable pool. See
  //    `treasury-netting.ts` for why it is indexed both by counterparty and by category
  //    over one shared set of lines.
  const inWindow = (dateISO: string) => weekIndexOf(dateISO, firstWeekStart, weekCount) >= 0
  const pool = buildPool(datedActualsAndExpected, inWindow)

  // 3. Commitment occurrences, each contributing only what the recorded money has not
  //    already accounted for. Only commitments on the projected lane contribute; other
  //    lanes are projected by their own `projectCashflow` call (the Posicion shows all
  //    lanes side by side).
  //
  //    Served in DATE order across every commitment, not in `commitments` array order:
  //    two items drawing on the same money split it differently depending on the order the
  //    list arrived in, and a residual could be dated BEFORE the payment that consumed the
  //    budget it was netted against. Which week trips `isBelowZero` must not depend on that.
  const occurrences: Occurrence[] = []
  for (const item of commitments) {
    if (item.currency !== currency) continue
    for (const at of expandCommitment(item, windowStart, windowEnd)) {
      const idx = weekIndexOf(format(at, ISO), firstWeekStart, weekCount)
      if (idx >= 0) occurrences.push({ item, at, idx })
    }
  }
  occurrences.sort((a, b) => a.at.getTime() - b.at.getTime())

  //    LINKED occurrences are served FIRST, then unlinked ones over what is left. Both
  //    kinds can reach the same cobro or pago - the linked one through its counterparty
  //    index, the unlinked one through the category index - and serving them by date alone
  //    let an unlinked occurrence take money that plainly belongs to a named one, which
  //    then re-projected in full. The specific claim beats the generic claim, and the
  //    order no longer depends on which occurrence happens to fall earlier.
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

  // 4. Roll up + carry forward.
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

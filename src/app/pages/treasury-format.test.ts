import { describe, expect, it } from 'vitest'
import { format, parseISO, startOfISOWeek } from 'date-fns'
import {
  actualOutflowCategory,
  buildWeeks,
  expandCommitment,
  paymentLines,
  projectCashflow,
  receivableLines,
  weekIndexOf,
  type CashflowWeek,
  type ProjectCashflowInput,
} from './treasury-format'
import {
  entityLinkRequired,
  entityTypeFor,
  seedCashAccount,
  seedCommittedItems,
  type CashAccount,
  type CommittedItem,
} from './treasury-mock-data'
import { receivables as seedReceivables, type Receivable } from './cobros-mock-data'
import { payments as seedPayments, type Payment } from './pagos-mock-data'

describe('buildWeeks', () => {
  it('builds 13 Monday-start weeks from the week containing asOf', () => {
    const weeks = buildWeeks('2026-06-26')
    expect(weeks).toHaveLength(13)
    expect(weeks[0].weekStart).toBe('2026-06-22')
    expect(weeks[0].weekIndex).toBe(0)
    expect(weeks[12].weekStart).toBe('2026-09-14')
    expect(weeks[0]).toMatchObject({ opening: 0, inflows: 0, outflows: 0, closing: 0, isBelowZero: false, lines: [] })
  })

  it('honors a custom week count', () => {
    expect(buildWeeks('2026-06-26', 4)).toHaveLength(4)
  })
})

describe('weekIndexOf', () => {
  const first = startOfISOWeek(parseISO('2026-06-22'))
  it('maps a date to its week bucket', () => {
    expect(weekIndexOf('2026-06-22', first, 13)).toBe(0)
    expect(weekIndexOf('2026-06-28', first, 13)).toBe(0)
    expect(weekIndexOf('2026-06-29', first, 13)).toBe(1)
  })
  it('returns -1 outside the window', () => {
    expect(weekIndexOf('2026-06-15', first, 13)).toBe(-1)
    expect(weekIndexOf('2026-09-21', first, 13)).toBe(-1)
  })
})

const baseItem: CommittedItem = {
  id: 'x', description: 'x', direction: 'outflow', amount: 100, currency: 'ARS',
  category: 'fixed_expense', recurrence: 'monthly', startDate: '2026-06-01',
  anchorDay: 10, confidence: 'committed', source: 'manual', isActive: true,
}

describe('expandCommitment', () => {
  const start = parseISO('2026-06-22')
  const end = parseISO('2026-09-20')

  it('expands a monthly item to one occurrence per month on anchorDay', () => {
    const occ = expandCommitment(baseItem, start, end).map((d) => format(d, 'yyyy-MM-dd'))
    expect(occ).toEqual(['2026-07-10', '2026-08-10', '2026-09-10'])
  })

  it('respects endDate', () => {
    const occ = expandCommitment({ ...baseItem, endDate: '2026-07-31' }, start, end)
      .map((d) => format(d, 'yyyy-MM-dd'))
    expect(occ).toEqual(['2026-07-10'])
  })

  it('handles one_time as a single occurrence', () => {
    const occ = expandCommitment(
      { ...baseItem, recurrence: 'one_time', startDate: '2026-08-01', anchorDay: 15 },
      start, end,
    ).map((d) => format(d, 'yyyy-MM-dd'))
    expect(occ).toEqual(['2026-08-15'])
  })

  it('steps quarterly from startDate', () => {
    const occ = expandCommitment(
      { ...baseItem, recurrence: 'quarterly', startDate: '2026-06-01', anchorDay: 1 },
      start, parseISO('2027-01-31'),
    ).map((d) => format(d, 'yyyy-MM-dd'))
    expect(occ).toEqual(['2026-09-01', '2026-12-01'])
  })
})

function makeReceivable(p: Partial<Receivable>): Receivable {
  return {
    id: 'rec', clientName: 'C', period: '2026-06-01', service: 's',
    baseAmount: 0, extraAmount: 0, extras: [], discountAmount: 0, totalAmount: 0,
    collectedAmount: 0, currency: 'ARS', dueDate: '2026-06-30',
    status: 'pending', billingStatus: 'no_invoice', taxProfileId: 'unassigned',
    lastActivityLabel: '', lastActivityAt: '2026-06-15', ...p,
  }
}

function makePayment(p: Partial<Payment>): Payment {
  return {
    id: 'pay', recipientName: 'R', recipientType: 'collaborator', period: '2026-06-01',
    concept: 'c', totalAmount: 0, paidAmount: 0, currency: 'ARS',
    expectedDate: '2026-06-30', status: 'pending', lastActivityLabel: '', lastActivityAt: '2026-06-15', ...p,
  }
}

describe('actualOutflowCategory', () => {
  it('maps recipient types to cashflow categories', () => {
    expect(actualOutflowCategory('employee')).toBe('salaries')
    expect(actualOutflowCategory('fixed_expense')).toBe('fixed_expense')
    expect(actualOutflowCategory('monotributo')).toBe('tax')
    expect(actualOutflowCategory('platform')).toBe('platform')
    expect(actualOutflowCategory('provider')).toBe('other')
  })
})

describe('receivableLines', () => {
  it('emits a realized actual inflow on the day the cash ARRIVED', () => {
    const lines = receivableLines([makeReceivable({ collectedAmount: 500, totalAmount: 500, status: 'collected', collectedAt: '2026-07-02', lastActivityAt: '2026-06-15T09:00:00' })])
    expect(lines).toContainEqual({ category: 'collection', direction: 'inflow', amount: 500, basis: 'actual', date: '2026-07-02' })
  })

  it('falls back to dueDate, never to lastActivityAt, when no collection day was recorded', () => {
    const lines = receivableLines([makeReceivable({ collectedAmount: 500, totalAmount: 500, status: 'collected', collectedAt: undefined, dueDate: '2026-07-10', lastActivityAt: '2026-06-15T09:00:00' })])
    expect(lines).toContainEqual({ category: 'collection', direction: 'inflow', amount: 500, basis: 'actual', date: '2026-07-10' })
  })

  it('carries the client id so the projection can match by identity', () => {
    const lines = receivableLines([makeReceivable({ clientId: 'cli-1', collectedAmount: 500, totalAmount: 500, status: 'collected', collectedAt: '2026-07-02' })])
    expect(lines[0].entity).toEqual({ type: 'client', id: 'cli-1' })
  })

  it('carries NO entity when the row names no client', () => {
    const lines = receivableLines([makeReceivable({ collectedAmount: 500, totalAmount: 500, status: 'collected', collectedAt: '2026-07-02' })])
    expect(lines[0].entity).toBeUndefined()
  })
  it('emits an outstanding projected inflow on dueDate', () => {
    const lines = receivableLines([makeReceivable({ collectedAmount: 200, totalAmount: 500, status: 'partial', dueDate: '2026-07-15' })])
    expect(lines).toContainEqual({ category: 'collection', direction: 'inflow', amount: 300, basis: 'projected', date: '2026-07-15' })
  })
  it('excludes cancelled receivables', () => {
    expect(receivableLines([makeReceivable({ totalAmount: 500, status: 'cancelled' })])).toHaveLength(0)
  })
})

describe('paymentLines', () => {
  it('emits a realized actual outflow categorized by recipientType', () => {
    const lines = paymentLines([makePayment({ recipientType: 'fixed_expense', paidAmount: 400, totalAmount: 400, status: 'paid', paymentDate: '2026-07-10' })])
    expect(lines).toContainEqual({ category: 'fixed_expense', direction: 'outflow', amount: 400, basis: 'actual', date: '2026-07-10' })
  })
  it('emits an outstanding projected outflow on expectedDate', () => {
    const lines = paymentLines([makePayment({ recipientType: 'employee', paidAmount: 0, totalAmount: 900, status: 'pending', expectedDate: '2026-07-05' })])
    expect(lines).toContainEqual({ category: 'salaries', direction: 'outflow', amount: 900, basis: 'projected', date: '2026-07-05' })
  })

  it('carries the recipient id, polymorphic by kind', () => {
    const member = paymentLines([makePayment({ recipientType: 'collaborator', teamMemberId: 'tm-1', paidAmount: 100, totalAmount: 100, status: 'paid', paymentDate: '2026-07-01' })])
    expect(member[0].entity).toEqual({ type: 'teamMember', id: 'tm-1' })
    const provider = paymentLines([makePayment({ recipientType: 'provider', providerId: 'prov-1', paidAmount: 100, totalAmount: 100, status: 'paid', paymentDate: '2026-07-01' })])
    expect(provider[0].entity).toEqual({ type: 'provider', id: 'prov-1' })
  })

  it('carries NO entity when the pago names nobody', () => {
    for (const recipientType of ['fixed_expense', 'monotributo', 'platform'] as const) {
      const lines = paymentLines([makePayment({ recipientType, paidAmount: 100, totalAmount: 100, status: 'paid', paymentDate: '2026-07-01' })])
      expect(lines[0].entity).toBeUndefined()
    }
  })

  it('carries the counterparty a gasto fijo or a monotributo DOES name', () => {
    const rent = paymentLines([makePayment({ recipientType: 'fixed_expense', providerId: 'prov-1', paidAmount: 100, totalAmount: 100, status: 'paid', paymentDate: '2026-07-01' })])
    expect(rent[0].entity).toEqual({ type: 'provider', id: 'prov-1' })
    const cuota = paymentLines([makePayment({ recipientType: 'monotributo', invoiceEmitterId: 'emi-1', paidAmount: 100, totalAmount: 100, status: 'paid', paymentDate: '2026-07-01' })])
    expect(cuota[0].entity).toEqual({ type: 'invoiceEmitter', id: 'emi-1' })
  })
})

const account: CashAccount = {
  id: 'a', name: 'Caja', currency: 'ARS', openingBalance: 1000, openingBalanceDate: '2026-06-01', isActive: true,
}

function run(p: Partial<ProjectCashflowInput>): CashflowWeek[] {
  return projectCashflow({ account, receivables: [], payments: [], commitments: [], asOf: '2026-06-22', weeks: 4, ...p })
}

const CLIENT = 'cli-1'
const MEMBER = 'tm-1'
const OTHER_MEMBER = 'tm-2'
const PROVIDER = 'prov-1'

function commitment(p: Partial<CommittedItem>): CommittedItem {
  return {
    id: 'c', description: 'x', direction: 'outflow', amount: 0, currency: 'ARS',
    category: 'fixed_expense', recurrence: 'monthly', startDate: '2026-06-01', anchorDay: 1,
    confidence: 'committed', source: 'manual', isActive: true, ...p,
  }
}

function run13(p: Partial<ProjectCashflowInput>): CashflowWeek[] {
  return run({ weeks: 13, ...p })
}

const totalIn = (weeks: CashflowWeek[]) => weeks.reduce((s, w) => s + w.inflows, 0)
const totalOut = (weeks: CashflowWeek[]) => weeks.reduce((s, w) => s + w.outflows, 0)

describe('projectCashflow', () => {
  it('carries the running balance week to week (closing[i] === opening[i+1])', () => {
    const weeks = run({})
    expect(weeks[0].opening).toBe(1000)
    for (let i = 0; i < weeks.length - 1; i++) {
      expect(weeks[i].closing).toBe(weeks[i + 1].opening)
    }
  })

  it('applies a committed outflow to its week and flags below-zero', () => {
    const big: CommittedItem = {
      id: 'c', description: 'Big', direction: 'outflow', amount: 5000, currency: 'ARS',
      category: 'fixed_expense', recurrence: 'one_time', startDate: '2026-07-01', anchorDay: 1,
      confidence: 'committed', source: 'manual', isActive: true,
    }
    const weeks = run({ commitments: [big] })
    const hit = weeks.find((w) => w.outflows === 5000)
    expect(hit).toBeDefined()
    expect(hit!.isBelowZero).toBe(true)
  })

  it('excludes a non-ARS commitment from the ARS projection lane', () => {
    const usd: CommittedItem = {
      id: 'u', description: 'USD bill', direction: 'outflow', amount: 5000, currency: 'USD',
      category: 'platform', recurrence: 'one_time', startDate: '2026-07-01', anchorDay: 1,
      confidence: 'committed', source: 'manual', isActive: true,
    }
    const weeks = run({ commitments: [usd] })
    expect(weeks.every((w) => w.outflows === 0)).toBe(true)
    expect(weeks.flatMap((w) => w.lines)).toHaveLength(0)
  })

  it('projects a chosen non-ARS lane from its own commitments, ignoring ARS actuals', () => {
    const usd: CommittedItem = {
      id: 'u', description: 'USD bill', direction: 'outflow', amount: 700, currency: 'USD',
      category: 'platform', recurrence: 'one_time', startDate: '2026-07-01', anchorDay: 1,
      confidence: 'committed', source: 'manual', isActive: true,
    }
    const arsItem: CommittedItem = {
      id: 'a', description: 'ARS bill', direction: 'outflow', amount: 999, currency: 'ARS',
      category: 'fixed_expense', recurrence: 'one_time', startDate: '2026-07-01', anchorDay: 1,
      confidence: 'committed', source: 'manual', isActive: true,
    }
    const arsActual = makePayment({ recipientType: 'employee', paidAmount: 800, totalAmount: 800, status: 'paid', paymentDate: '2026-07-01' })
    const usdAccount: CashAccount = { ...account, openingBalance: 5000 }
    const weeks = projectCashflow({
      account: usdAccount, receivables: [], payments: [arsActual],
      commitments: [usd, arsItem], asOf: '2026-06-22', weeks: 6, currency: 'USD',
    })
    expect(weeks.reduce((s, w) => s + w.outflows, 0)).toBe(700)
    expect(weeks[0].opening).toBe(5000)
    expect(weeks.flatMap((w) => w.lines).every((l) => l.amount === 700)).toBe(true)
  })

  it('does not double-count: a payment TO THE LINKED MEMBER supersedes the occurrence it realizes', () => {
    const salaryCommitment = commitment({
      direction: 'outflow', category: 'salaries', amount: 800, recurrence: 'monthly',
      startDate: '2026-07-01', endDate: '2026-07-31', anchorDay: 1,
      linkedEntityType: 'teamMember', linkedEntityId: MEMBER,
    })
    const actualSalary = makePayment({ recipientType: 'employee', teamMemberId: MEMBER, paidAmount: 800, totalAmount: 800, status: 'paid', paymentDate: '2026-07-01' })
    const weeks = run({ commitments: [salaryCommitment], payments: [actualSalary], weeks: 6 })
    const wk = weeks.find((w) => w.weekStart === '2026-06-29')
    expect(wk).toBeDefined()
    expect(wk!.outflows).toBe(800)
    expect(wk!.lines.filter((l) => l.direction === 'outflow' && l.category === 'salaries')).toHaveLength(1)
    expect(wk!.lines.find((l) => l.category === 'salaries')!.basis).toBe('actual')
  })

  it('an UNLINKED commitment nets on the category key, week bridge included', () => {
    const rent = commitment({
      category: 'fixed_expense', amount: 1_000_000, recurrence: 'monthly',
      startDate: '2026-08-01', endDate: '2026-08-31', anchorDay: 1,
    })
    const paid = makePayment({ recipientType: 'fixed_expense', paidAmount: 1_000_000, totalAmount: 1_000_000, status: 'paid', paymentDate: '2026-07-31' })
    expect(totalOut(run13({ commitments: [rent], payments: [paid] }))).toBe(1_000_000)
  })

  it('integration: runs against the real seed and returns 13 finite weeks', () => {
    const weeks = projectCashflow({
      account: seedCashAccount, receivables: seedReceivables, payments: seedPayments,
      commitments: seedCommittedItems, asOf: '2026-06-01',
    })
    expect(weeks).toHaveLength(13)
    expect(weeks[0].opening).toBe(seedCashAccount.openingBalance)
    for (const w of weeks) {
      expect(Number.isFinite(w.opening)).toBe(true)
      expect(Number.isFinite(w.closing)).toBe(true)
      expect(w.closing).toBeCloseTo(w.opening + w.inflows - w.outflows, 6)
    }
  })
})

describe('projectCashflow — the eleven scenarios', () => {
  it('1. a retainer due the 10th, collected on the 2nd, counts once', () => {
    const abono = commitment({
      direction: 'inflow', category: 'retainer', amount: 500, recurrence: 'monthly',
      startDate: '2026-07-01', endDate: '2026-07-31', anchorDay: 10,
      linkedEntityType: 'client', linkedEntityId: CLIENT,
    })
    const cobro = makeReceivable({
      clientId: CLIENT, totalAmount: 500, collectedAmount: 500, status: 'collected',
      collectedAt: '2026-07-02', dueDate: '2026-07-10',
      lastActivityAt: '2026-07-20T09:00:00',
    })
    expect(totalIn(run13({ commitments: [abono], receivables: [cobro] }))).toBe(500)
  })

  it('2. the week the cobro was OPENED does not enter the answer', () => {
    const abono = commitment({
      direction: 'inflow', category: 'retainer', amount: 500, recurrence: 'monthly',
      startDate: '2026-07-01', endDate: '2026-07-31', anchorDay: 10,
      linkedEntityType: 'client', linkedEntityId: CLIENT,
    })
    const cobro = makeReceivable({
      clientId: CLIENT, totalAmount: 500, collectedAmount: 500, status: 'collected',
      collectedAt: '2026-07-02', dueDate: '2026-07-10',
      lastActivityAt: '2026-06-23T10:00:00',
    })
    const weeks = run13({ commitments: [abono], receivables: [cobro] })
    expect(totalIn(weeks)).toBe(500)
    expect(weeks.find((w) => w.weekStart === '2026-06-29')!.inflows).toBe(500)
    expect(weeks.find((w) => w.weekStart === '2026-06-22')!.inflows).toBe(0)
  })

  it("3. a July collection does not suppress June's occurrence", () => {
    const abono = commitment({
      direction: 'inflow', category: 'retainer', amount: 500, recurrence: 'monthly',
      startDate: '2026-06-01', endDate: '2026-07-31', anchorDay: 25,
      linkedEntityType: 'client', linkedEntityId: CLIENT,
    })
    const cobro = makeReceivable({
      clientId: CLIENT, totalAmount: 500, collectedAmount: 500, status: 'collected',
      collectedAt: '2026-07-24', dueDate: '2026-07-25',
    })
    expect(totalIn(run13({ commitments: [abono], receivables: [cobro] }))).toBe(1000)
  })

  it('4. a 5.000 payment to ANOTHER member cannot erase a 3.000.000 payroll', () => {
    const payroll = commitment({
      category: 'salaries', amount: 3_000_000, recurrence: 'monthly',
      startDate: '2026-07-01', endDate: '2026-07-31', anchorDay: 25,
      linkedEntityType: 'teamMember', linkedEntityId: MEMBER,
    })
    const unrelated = makePayment({
      recipientType: 'collaborator', teamMemberId: OTHER_MEMBER,
      paidAmount: 5000, totalAmount: 5000, status: 'paid', paymentDate: '2026-07-02',
    })
    expect(totalOut(run13({ commitments: [payroll], payments: [unrelated] }))).toBe(3_005_000)
  })

  it('5. an unrelated payment does not cancel a one_time commitment', () => {
    const oneOff = commitment({
      category: 'other', amount: 900_000, recurrence: 'one_time',
      startDate: '2026-07-01', anchorDay: 1,
      linkedEntityType: 'provider', linkedEntityId: PROVIDER,
    })
    const unrelated = makePayment({
      recipientType: 'provider', providerId: 'prov-2',
      paidAmount: 1000, totalAmount: 1000, status: 'paid', paymentDate: '2026-09-10',
    })
    expect(totalOut(run13({ commitments: [oneOff], payments: [unrelated] }))).toBe(901_000)
  })

  it('6. an anchor on the 1st is realized by money that moved the previous month', () => {
    const rent = commitment({
      category: 'other', amount: 1_000_000, recurrence: 'monthly',
      startDate: '2026-08-01', endDate: '2026-08-31', anchorDay: 1,
      linkedEntityType: 'provider', linkedEntityId: PROVIDER,
    })
    const paid = makePayment({
      recipientType: 'provider', providerId: PROVIDER,
      paidAmount: 1_000_000, totalAmount: 1_000_000, status: 'paid', paymentDate: '2026-07-31',
    })
    expect(totalOut(run13({ commitments: [rent], payments: [paid] }))).toBe(1_000_000)
  })

  it('7. an out-of-window ACTUAL still nets', () => {
    const payroll = commitment({
      category: 'salaries', amount: 3_000_000, recurrence: 'monthly',
      startDate: '2026-06-01', endDate: '2026-06-30', anchorDay: 25,
      linkedEntityType: 'teamMember', linkedEntityId: MEMBER,
    })
    const paidEarly = makePayment({
      recipientType: 'collaborator', teamMemberId: MEMBER,
      paidAmount: 3_000_000, totalAmount: 3_000_000, status: 'paid',
      paymentDate: '2026-06-02',
    })
    expect(totalOut(run13({ commitments: [payroll], payments: [paidEarly] }))).toBe(0)
  })

  it('8. an out-of-window PROJECTED line does NOT net', () => {
    const payroll = commitment({
      category: 'salaries', amount: 3_000_000, recurrence: 'one_time',
      startDate: '2026-07-01', anchorDay: 1,
      linkedEntityType: 'teamMember', linkedEntityId: MEMBER,
    })
    const pendingLater = makePayment({
      recipientType: 'collaborator', teamMemberId: MEMBER,
      paidAmount: 0, totalAmount: 3_000_000, status: 'pending',
      expectedDate: '2026-12-20',
    })
    expect(totalOut(run13({ commitments: [payroll], payments: [pendingLater] }))).toBe(3_000_000)
  })

  it('9. same shape, other direction: an overdue cobro dated before the window', () => {
    const abono = commitment({
      direction: 'inflow', category: 'retainer', amount: 500, recurrence: 'monthly',
      startDate: '2026-07-01', endDate: '2026-07-31', anchorDay: 10,
      linkedEntityType: 'client', linkedEntityId: CLIENT,
    })
    const overdue = makeReceivable({
      clientId: CLIENT, totalAmount: 500, collectedAmount: 0, status: 'overdue',
      dueDate: '2026-05-15',
    })
    expect(totalIn(run13({ commitments: [abono], receivables: [overdue] }))).toBe(500)
  })

  it('10. the UNPAID state, the common one, is not double-counted', () => {
    const payroll = commitment({
      category: 'salaries', amount: 3_000_000, recurrence: 'one_time',
      startDate: '2026-07-25', anchorDay: 25,
      linkedEntityType: 'teamMember', linkedEntityId: MEMBER,
    })
    const pending = makePayment({
      recipientType: 'collaborator', teamMemberId: MEMBER,
      paidAmount: 0, totalAmount: 3_000_000, status: 'pending', expectedDate: '2026-07-25',
    })
    expect(totalOut(run13({ commitments: [payroll], payments: [pending] }))).toBe(3_000_000)
  })

  it('11. the answer does not depend on the order either list arrives in', () => {
    const a = commitment({
      id: 'a', category: 'salaries', amount: 2_000_000, recurrence: 'one_time',
      startDate: '2026-07-01', anchorDay: 1,
      linkedEntityType: 'teamMember', linkedEntityId: MEMBER,
    })
    const b = commitment({
      id: 'b', category: 'salaries', amount: 1_000_000, recurrence: 'one_time',
      startDate: '2026-08-01', anchorDay: 1,
      linkedEntityType: 'teamMember', linkedEntityId: MEMBER,
    })
    const p1 = makePayment({ id: 'p1', recipientType: 'collaborator', teamMemberId: MEMBER, paidAmount: 2_000_000, totalAmount: 2_000_000, status: 'paid', paymentDate: '2026-07-01' })
    const p2 = makePayment({ id: 'p2', recipientType: 'collaborator', teamMemberId: MEMBER, paidAmount: 1_000_000, totalAmount: 1_000_000, status: 'paid', paymentDate: '2026-08-01' })
    const shape = (weeks: CashflowWeek[]) => weeks.map((w) => [w.weekStart, w.inflows, w.outflows])

    expect(shape(run13({ commitments: [a, b], payments: [p1, p2] })))
      .toEqual(shape(run13({ commitments: [b, a], payments: [p2, p1] })))
    expect(shape(run13({ commitments: [a, b], payments: [p1, p2] })))
      .toEqual(shape(run13({ commitments: [b, a], payments: [p1, p2] })))
  })
})

describe('projectCashflow - an unlinked commitment still nets', () => {
  it('a legacy retainer is realized by its client cobro, on the category key', () => {
    const legacy = commitment({
      direction: 'inflow', category: 'retainer', amount: 500_000, recurrence: 'monthly',
      startDate: '2026-07-01', endDate: '2026-07-31', anchorDay: 10,
    })
    const cobro = makeReceivable({
      clientId: CLIENT, totalAmount: 500_000, collectedAmount: 500_000, status: 'collected',
      collectedAt: '2026-07-09', dueDate: '2026-07-10',
    })
    expect(totalIn(run13({ commitments: [legacy], receivables: [cobro] }))).toBe(500_000)
  })

  it('but a small unrelated payment still cannot erase a large unlinked commitment', () => {
    const payroll = commitment({
      category: 'salaries', amount: 3_000_000, recurrence: 'monthly',
      startDate: '2026-07-01', endDate: '2026-07-31', anchorDay: 25,
    })
    const small = makePayment({
      recipientType: 'collaborator', teamMemberId: OTHER_MEMBER,
      paidAmount: 5000, totalAmount: 5000, status: 'paid', paymentDate: '2026-07-02',
    })
    expect(totalOut(run13({ commitments: [payroll], payments: [small] }))).toBe(3_000_000)
  })

  it('a LINKED occurrence claims its own money before an unlinked one can take it', () => {
    const linked = commitment({
      id: 'linked', category: 'salaries', amount: 1_000_000, recurrence: 'one_time',
      startDate: '2026-07-20', anchorDay: 20,
      linkedEntityType: 'teamMember', linkedEntityId: MEMBER,
    })
    const unlinked = commitment({
      id: 'unlinked', category: 'salaries', amount: 1_000_000, recurrence: 'one_time',
      startDate: '2026-07-05', anchorDay: 5,
    })
    const toMember = makePayment({
      recipientType: 'collaborator', teamMemberId: MEMBER,
      paidAmount: 1_000_000, totalAmount: 1_000_000, status: 'paid', paymentDate: '2026-07-21',
    })
    expect(totalOut(run13({ commitments: [unlinked, linked], payments: [toMember] }))).toBe(2_000_000)
    expect(totalOut(run13({ commitments: [linked, unlinked], payments: [toMember] }))).toBe(2_000_000)
  })
})

describe('entityTypeFor — the anchors', () => {
  it('points a monotributo cuota at its emisor, not at a provider', () => {
    expect(entityTypeFor('tax', 'outflow')).toBe('invoiceEmitter')
  })

  it('points a gasto fijo and a plataforma at whoever is paid', () => {
    expect(entityTypeFor('fixed_expense', 'outflow')).toBe('provider')
    expect(entityTypeFor('platform', 'outflow')).toBe('provider')
  })

  it('names nothing on the wrong direction', () => {
    for (const category of ['tax', 'platform', 'fixed_expense'] as const) {
      expect(entityTypeFor(category, 'inflow')).toBeUndefined()
    }
  })

  it('requires a counterparty only where one definitionally exists', () => {
    expect(entityLinkRequired('retainer', 'inflow')).toBe(true)
    expect(entityLinkRequired('salaries', 'outflow')).toBe(true)
    for (const category of ['tax', 'platform', 'fixed_expense', 'other'] as const) {
      expect(entityLinkRequired(category, 'outflow')).toBe(false)
    }
  })
})

describe('projectCashflow — the new anchors net by identity', () => {
  const asOf = '2026-06-22'

  it('supersedes a gasto fijo by the pago to ITS provider, not by another', () => {
    const rent = {
      ...baseItem,
      id: 'rent',
      amount: 500_000,
      category: 'fixed_expense' as const,
      recurrence: 'one_time' as const,
      startDate: '2026-07-08',
      anchorDay: 8,
      linkedEntityType: 'provider' as const,
      linkedEntityId: 'prov-landlord',
    }
    const paidToLandlord = makePayment({
      recipientType: 'fixed_expense',
      providerId: 'prov-landlord',
      paidAmount: 500_000,
      totalAmount: 500_000,
      status: 'paid',
      paymentDate: '2026-07-08',
    })
    const paidToSomeoneElse = makePayment({
      id: 'pay-2',
      recipientType: 'fixed_expense',
      providerId: 'prov-other',
      paidAmount: 90_000,
      totalAmount: 90_000,
      status: 'paid',
      paymentDate: '2026-07-09',
    })

    const weeks = projectCashflow({
      account,
      receivables: [],
      payments: [paidToLandlord, paidToSomeoneElse],
      commitments: [rent],
      asOf,
    })
    const outflows = weeks.reduce((sum, w) => sum + w.outflows, 0)
    expect(outflows).toBe(590_000)
  })

  it('supersedes a monotributo cuota only by ITS emisor', () => {
    const cuota = {
      ...baseItem,
      id: 'cuota',
      amount: 40_000,
      category: 'tax' as const,
      recurrence: 'one_time' as const,
      startDate: '2026-07-20',
      anchorDay: 20,
      linkedEntityType: 'invoiceEmitter' as const,
      linkedEntityId: 'emi-1',
    }
    const otherEmitter = makePayment({
      recipientType: 'monotributo',
      invoiceEmitterId: 'emi-2',
      paidAmount: 40_000,
      totalAmount: 40_000,
      status: 'paid',
      paymentDate: '2026-07-18',
    })

    const weeks = projectCashflow({
      account,
      receivables: [],
      payments: [otherEmitter],
      commitments: [cuota],
      asOf,
    })
    expect(weeks.reduce((sum, w) => sum + w.outflows, 0)).toBe(80_000)

    const ownEmitter = makePayment({
      recipientType: 'monotributo',
      invoiceEmitterId: 'emi-1',
      paidAmount: 40_000,
      totalAmount: 40_000,
      status: 'paid',
      paymentDate: '2026-07-18',
    })
    const netted = projectCashflow({
      account,
      receivables: [],
      payments: [ownEmitter],
      commitments: [cuota],
      asOf,
    })
    expect(netted.reduce((sum, w) => sum + w.outflows, 0)).toBe(40_000)
  })

  it('still nets a commitment whose pago was filed as a plain proveedor', () => {
    const rent = {
      ...baseItem,
      id: 'rent',
      amount: 500_000,
      category: 'fixed_expense' as const,
      recurrence: 'one_time' as const,
      startDate: '2026-07-08',
      anchorDay: 8,
      linkedEntityType: 'provider' as const,
      linkedEntityId: 'prov-landlord',
    }
    const asProvider = makePayment({
      recipientType: 'provider',
      providerId: 'prov-landlord',
      paidAmount: 500_000,
      totalAmount: 500_000,
      status: 'paid',
      paymentDate: '2026-07-08',
    })
    const weeks = projectCashflow({
      account,
      receivables: [],
      payments: [asProvider],
      commitments: [rent],
      asOf,
    })
    expect(weeks.reduce((sum, w) => sum + w.outflows, 0)).toBe(500_000)
  })
})

describe('projectCashflow across currency lanes', () => {
  const dollarPago = makePayment({
    id: 'p-usd',
    currency: 'USD',
    totalAmount: 80,
    expectedDate: '2026-06-24',
  })

  it('keeps a dollar pago out of the peso projection', () => {
    const withDollar = run({ payments: [dollarPago] })
    const withoutIt = run({ payments: [] })

    expect(withDollar[0].outflows).toBe(withoutIt[0].outflows)
    expect(withDollar[0].closing).toBe(withoutIt[0].closing)
  })

  it('projects the dollar pago in the dollar lane', () => {
    const weeks = run({ currency: 'USD', payments: [dollarPago] })

    expect(weeks[0].outflows).toBe(80)
    expect(weeks[0].closing).toBe(920)
  })

  it('keeps a dollar cobro out of the peso projection and in its own', () => {
    const dollarCobro = makeReceivable({
      id: 'r-usd',
      currency: 'USD',
      totalAmount: 900,
      dueDate: '2026-06-24',
    })

    expect(run({ receivables: [dollarCobro] })[0].inflows).toBe(0)
    expect(run({ currency: 'USD', receivables: [dollarCobro] })[0].inflows).toBe(900)
  })

  it('still projects a peso pago into the peso lane', () => {
    const weeks = run({
      payments: [makePayment({ id: 'p-ars', totalAmount: 60_000, expectedDate: '2026-06-24' })],
    })
    expect(weeks[0].outflows).toBe(60_000)
  })
})

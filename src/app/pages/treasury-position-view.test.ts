import { describe, expect, it } from 'vitest'

import {
  buildPositionModel,
  formatCompactLaneAmount,
  formatLaneAmount,
  rowLane,
} from './treasury-position-view'
import { seedAccounts, type Account, type CommittedItem, type Money } from './treasury-mock-data'
import type { Receivable } from './cobros-mock-data'
import type { Payment } from './pagos-mock-data'
import { pendingPayoutRows, type PendingPayout } from './treasury-pending-payouts'

function makeReceivable(partial: Partial<Receivable>): Receivable {
  return {
    id: 'rec', clientName: 'Cliente', period: '2026-06-01', service: 's',
    baseAmount: 0, extraAmount: 0, extras: [], discountAmount: 0, totalAmount: 0, collectedAmount: 0,
    currency: 'ARS', dueDate: '2026-06-30', status: 'pending', billingStatus: 'no_invoice',
    taxProfileId: 'unassigned', lastActivityLabel: '', lastActivityAt: '2026-06-15', ...partial,
  }
}

function makePayment(partial: Partial<Payment>): Payment {
  return {
    id: 'pay', recipientName: 'Proveedor', recipientType: 'provider', period: '2026-06-01',
    concept: 'c', totalAmount: 0, paidAmount: 0, currency: 'ARS', expectedDate: '2026-06-30',
    status: 'pending', lastActivityLabel: '', lastActivityAt: '2026-06-15', ...partial,
  }
}

function makeItem(partial: Partial<CommittedItem>): CommittedItem {
  return {
    id: 'c', description: 'Item', direction: 'outflow', amount: 0, currency: 'ARS',
    category: 'other', recurrence: 'one_time', startDate: '2026-06-15', anchorDay: 15,
    confidence: 'committed', source: 'manual', isActive: true, ...partial,
  }
}

describe('formatLaneAmount', () => {
  it('gives each lane its own symbol', () => {
    expect(formatLaneAmount(1_500_000, 'ARS')).toContain('$')
    expect(formatLaneAmount(1_500, 'USD')).toContain('US$')
  })
})

describe('formatCompactLaneAmount', () => {
  it('formats each lane compactly, keeping its symbol', () => {
    expect(formatCompactLaneAmount(1_500_000, 'ARS')).toContain('$')
    expect(formatCompactLaneAmount(2_000, 'USD')).toContain('US$')
  })
})

describe('rowLane', () => {
  it('reads the lane the row actually carries', () => {
    expect(rowLane({ ARS: 500 })).toBe('ARS')
    expect(rowLane({ USD: 500 })).toBe('USD')
  })

  it('is undefined for a lane this build does not know, so nothing borrows a symbol', () => {
    const foreign = { FCI: 900 } as unknown as Money
    expect(rowLane(foreign)).toBeUndefined()
  })

  it('is undefined for a row with no lane at all', () => {
    expect(rowLane({})).toBeUndefined()
  })
})

describe('buildPositionModel', () => {
  const accounts: Account[] = [
    { id: 'op1', name: 'Banco A', partner: 'vicky', type: 'bank', balances: { ARS: 1_000, USD: 50 }, isActive: true },
    { id: 'op2', name: 'Caja B', partner: 'flor', type: 'cash', balances: { ARS: 500 }, isActive: true },
    { id: 'res1', name: 'FIMA', partner: 'shared', type: 'investment', balances: { ARS: 2_000 }, isReserve: true, isActive: true },
  ]
  const receivables: Receivable[] = [
    makeReceivable({ id: 'r1', clientName: 'Acme', totalAmount: 300, collectedAmount: 0, dueDate: '2026-06-28' }),
    makeReceivable({ id: 'r2', clientName: 'Acme', totalAmount: 200, collectedAmount: 0, dueDate: '2026-06-20' }),
    makeReceivable({ id: 'r3', clientName: 'Paid', totalAmount: 500, collectedAmount: 500, status: 'collected' }),
  ]
  const payments: Payment[] = [makePayment({ id: 'p1', recipientName: 'Bob', totalAmount: 100, paidAmount: 0 })]
  const commitments: CommittedItem[] = [
    makeItem({ id: 'usd-in', direction: 'inflow', currency: 'USD', amount: 2_000, category: 'retainer' }),
    makeItem({
      id: 'ars-out', direction: 'outflow', currency: 'ARS', amount: 900, category: 'salaries',
      installments: [{ date: '2026-06-12', amount: 300 }, { date: '2026-06-19', amount: 300 }],
      reimbursement: { amount: 50, note: 'Reintegro' }, observations: 'Resto a liquidar',
    }),
    makeItem({ id: 'settled', direction: 'outflow', currency: 'ARS', amount: 100, installments: [{ date: '2026-06-10', amount: 100 }] }),
  ]
  const model = buildPositionModel({ accounts, receivables, payments, commitments, asOfISO: '2026-06-22' })

  it('labels the anchor date', () => {
    expect(model.asOfLabel).toBe('22 de junio de 2026')
  })

  it('totals operating Saldos and the reserve per lane', () => {
    expect(model.saldos.total).toEqual({ ARS: 1_500, USD: 50 })
    expect(model.reserva.total).toEqual({ ARS: 2_000 })
  })

  it('aggregates auto receivables by client (sum, earliest date) and drops fully collected ones', () => {
    const acme = model.ingresosPendientes.rows.find((row) => row.label === 'Acme')
    expect(acme?.balances).toEqual({ ARS: 500 })
    expect(acme?.detail).toBe('20 jun')
    expect(model.ingresosPendientes.rows.some((row) => row.label === 'Paid')).toBe(false)
  })

  it('includes manual USD pendientes alongside the auto ARS rows', () => {
    const usd = model.ingresosPendientes.rows.find((row) => row.id === 'usd-in')
    expect(usd?.balances).toEqual({ USD: 2_000 })
    expect(model.ingresosPendientes.total).toEqual({ ARS: 500, USD: 2_000 })
  })

  it('shows a salary pendiente net of "a cuenta" installments, with reintegro + observations', () => {
    const salary = model.egresosPendientes.rows.find((row) => row.id === 'ars-out')
    expect(salary?.balances).toEqual({ ARS: 300 })
    expect(salary?.installments).toHaveLength(2)
    expect(salary?.reimbursement).toEqual({ amount: 50, note: 'Reintegro' })
    expect(salary?.observations).toBe('Resto a liquidar')
  })

  it('drops a manual item fully settled by installments with no reintegro', () => {
    expect(model.egresosPendientes.rows.some((row) => row.id === 'settled')).toBe(false)
  })

  it('computes Egresos total, Posición and patrimonio per lane', () => {
    expect(model.egresosPendientes.total).toEqual({ ARS: 400 })
    expect(model.saldosMasACobrar).toEqual({ ARS: 2_000, USD: 2_050 })
    expect(model.posicion).toEqual({ ARS: 1_600, USD: 2_050 })
    expect(model.patrimonio).toEqual({ ARS: 3_600, USD: 2_050 })
  })
})

describe('buildPositionModel over the seed', () => {
  const model = buildPositionModel({
    accounts: seedAccounts,
    receivables: [],
    payments: [],
    commitments: [],
    asOfISO: '2026-06-22',
  })

  it('reflects the seed Saldos and reserve totals', () => {
    expect(model.saldos.total).toEqual({ ARS: 2_385_000, USD: 1_800 })
    expect(model.reserva.total).toEqual({ ARS: 4_300_000, USD: 7_000 })
  })

  it('surfaces account observations on the Saldos rows', () => {
    const ff = model.saldos.rows.find((row) => row.label === 'Efectivo FF')
    expect(ff?.observations).toBe('Incluye dólares de caja chica')
  })
})

describe('buildPositionModel — settlement movements', () => {
  const account: Account = {
    id: 'acc-1',
    name: 'Santander',
    partner: 'shared',
    type: 'bank',
    balances: { ARS: 1_000_000 },
    isActive: true,
  }

  it('leaves every total untouched — the movements are already inside the balances', () => {
    const withoutMovements = buildPositionModel({
      accounts: [account], receivables: [], payments: [], commitments: [], asOfISO: '2026-06-01',
    })
    const withMovements = buildPositionModel({
      accounts: [account], receivables: [], payments: [], commitments: [], asOfISO: '2026-06-01',
      movements: [
        { accountId: 'acc-1', direction: 'inflow', lane: 'ARS', amount: 250_000 },
        { accountId: 'acc-1', direction: 'outflow', lane: 'ARS', amount: 40_000 },
      ],
    })

    expect(withMovements.saldos.total).toEqual(withoutMovements.saldos.total)
    expect(withMovements.posicion).toEqual(withoutMovements.posicion)
    expect(withMovements.patrimonio).toEqual(withoutMovements.patrimonio)
  })

  it('says what moved the balance, in and out, on the account it moved', () => {
    const model = buildPositionModel({
      accounts: [account], receivables: [], payments: [], commitments: [], asOfISO: '2026-06-01',
      movements: [
        { accountId: 'acc-1', direction: 'inflow', lane: 'ARS', amount: 250_000 },
        { accountId: 'acc-1', direction: 'outflow', lane: 'ARS', amount: 40_000 },
        { accountId: 'acc-2', direction: 'inflow', lane: 'ARS', amount: 999_999 },
      ],
    })

    const row = model.saldos.rows.find((r) => r.id === 'acc-1')
    expect(row?.observations).toContain('cobros')
    expect(row?.observations).toContain('pagos')
    expect(row?.observations).not.toContain('999')
  })

  it('says nothing when nothing moved', () => {
    const model = buildPositionModel({
      accounts: [account], receivables: [], payments: [], commitments: [], asOfISO: '2026-06-01',
      movements: [],
    })
    expect(model.saldos.rows.find((r) => r.id === 'acc-1')?.observations).toBeUndefined()
  })

  it('keeps the operator note AND the provenance — the note does not displace it', () => {
    const model = buildPositionModel({
      accounts: [{ ...account, note: 'Cuenta de la agencia' }],
      receivables: [], payments: [], commitments: [], asOfISO: '2026-06-01',
      movements: [{ accountId: 'acc-1', direction: 'inflow', lane: 'ARS', amount: 250_000 }],
    })
    const observations = model.saldos.rows.find((r) => r.id === 'acc-1')?.observations
    expect(observations).toContain('Cuenta de la agencia')
    expect(observations).toContain('250.000')
  })

  it('ignores a blank note rather than rendering a stray separator', () => {
    const model = buildPositionModel({
      accounts: [{ ...account, note: '   ' }],
      receivables: [], payments: [], commitments: [], asOfISO: '2026-06-01',
      movements: [{ accountId: 'acc-1', direction: 'inflow', lane: 'ARS', amount: 250_000 }],
    })
    const observations = model.saldos.rows.find((r) => r.id === 'acc-1')?.observations
    expect(observations?.startsWith('+')).toBe(true)
    expect(observations).not.toContain(' · ')
  })

  it('reports a USD movement and names the lane', () => {
    const model = buildPositionModel({
      accounts: [account], receivables: [], payments: [], commitments: [], asOfISO: '2026-06-01',
      movements: [{ accountId: 'acc-1', direction: 'inflow', lane: 'USD', amount: 5_000 }],
    })
    const observations = model.saldos.rows.find((r) => r.id === 'acc-1')?.observations
    expect(observations?.replace(/\u00a0/g, ' ')).toBe('+US$ 5.000 en cobros desde la fecha de la posición')
    expect(observations).not.toContain(String.fromCharCode(36) + ' ')
  })
})

describe('buildPositionModel — pending payroll', () => {
  const accounts: Account[] = [
    {
      id: 'acc',
      name: 'Caja',
      partner: 'shared',
      type: 'cash',
      balances: { ARS: 1_000_000 },
      isReserve: false,
      isActive: true,
    } as Account,
  ]

  function model(payouts: PendingPayout[]) {
    return buildPositionModel({
      accounts,
      receivables: [],
      payments: [],
      commitments: [],
      payouts,
      asOfISO: '2026-06-22',
    })
  }

  it('counts an unpaid liquidación as an egreso pendiente', () => {
    const withPayroll = model([
      { id: 'payout-1', teamMemberId: 'tm-ana', label: 'Ana', date: '2026-07-05', amount: 300_000 },
    ])
    expect(withPayroll.egresosPendientes.total).toEqual({ ARS: 300_000 })
    expect(withPayroll.posicion).toEqual({ ARS: 700_000 })
  })

  it('leaves the section exactly as it was when there is no payroll owed', () => {
    expect(model([]).egresosPendientes.rows).toHaveLength(0)
    expect(model([]).posicion).toEqual({ ARS: 1_000_000 })
  })

  it('keeps a liquidación and a pago to the same person as separate rows', () => {
    const built = buildPositionModel({
      accounts,
      receivables: [],
      payments: [makePayment({ recipientName: 'Ana', totalAmount: 50_000, paidAmount: 0 })],
      commitments: [],
      payouts: [{ id: 'payout-1', teamMemberId: 'tm-ana', label: 'Ana', date: '2026-07-05', amount: 300_000 }],
      asOfISO: '2026-06-22',
    })
    expect(built.egresosPendientes.rows).toHaveLength(2)
    expect(built.egresosPendientes.total).toEqual({ ARS: 350_000 })
  })
})

describe('pendingPayoutRows', () => {
  const dto = (over: Record<string, unknown>) =>
    ({
      id: 'p1',
      teamMemberId: 'm1',
      period: '2026-07-01',
      outstandingMinor: '30000000',
      dueDate: '2026-07-05',
      ...over,
    }) as never

  it('names the row from the roster and converts minor units to pesos', () => {
    const [row] = pendingPayoutRows([dto({})], { m1: 'Ana' })
    expect(row).toMatchObject({ label: 'Ana', date: '2026-07-05', amount: 300_000 })
  })

  it('still reports the amount when the roster is unavailable', () => {
    const [row] = pendingPayoutRows([dto({})], {})
    expect(row.amount).toBe(300_000)
    expect(row.label).toBe('Liquidación 2026-07')
  })

  it('falls back to the period when the plan set no due date', () => {
    const [row] = pendingPayoutRows([dto({ dueDate: null })], { m1: 'Ana' })
    expect(row.date).toBe('2026-07-01')
  })
})

describe('buildPositionModel — a plan and its realization are one', () => {
  const accounts: Account[] = [
    {
      id: 'acc', name: 'Caja', partner: 'shared', type: 'cash',
      balances: { ARS: 1_000_000 }, isReserve: false, isActive: true,
    } as Account,
  ]

  const salaryPlan = (over: Partial<CommittedItem> = {}) =>
    makeItem({
      id: 'plan',
      description: 'Sueldos',
      direction: 'outflow',
      category: 'salaries',
      amount: 300_000,
      linkedEntityType: 'teamMember',
      linkedEntityId: 'tm-ana',
      ...over,
    })

  const anaPayout = (amount: number) => ({
    id: 'payout-1', teamMemberId: 'tm-ana', label: 'Ana', date: '2026-07-05', amount,
  })

  it('counts payroll ONCE when the plan and the liquidación are the same money', () => {
    const model = buildPositionModel({
      accounts, receivables: [], payments: [],
      commitments: [salaryPlan()],
      payouts: [anaPayout(300_000)],
      asOfISO: '2026-06-22',
    })
    expect(model.egresosPendientes.total).toEqual({ ARS: 300_000 })
  })

  it('keeps the part of the plan the liquidación does not cover', () => {
    const model = buildPositionModel({
      accounts, receivables: [], payments: [],
      commitments: [salaryPlan({ amount: 500_000 })],
      payouts: [anaPayout(300_000)],
      asOfISO: '2026-06-22',
    })
    expect(model.egresosPendientes.total).toEqual({ ARS: 500_000 })
  })

  it('nets a plan against an outstanding pago to the same person', () => {
    const model = buildPositionModel({
      accounts, receivables: [],
      payments: [
        makePayment({ recipientName: 'Ana', recipientType: 'collaborator', teamMemberId: 'tm-ana', totalAmount: 300_000, paidAmount: 0 }),
      ],
      commitments: [salaryPlan()],
      payouts: [],
      asOfISO: '2026-06-22',
    })
    expect(model.egresosPendientes.total).toEqual({ ARS: 300_000 })
  })

  it('leaves a plan for SOMEBODY ELSE alone', () => {
    const model = buildPositionModel({
      accounts, receivables: [], payments: [],
      commitments: [salaryPlan({ linkedEntityId: 'tm-bruno' })],
      payouts: [anaPayout(300_000)],
      asOfISO: '2026-06-22',
    })
    expect(model.egresosPendientes.total).toEqual({ ARS: 600_000 })
  })

  it('leaves an UNLINKED plan counting in full', () => {
    const model = buildPositionModel({
      accounts, receivables: [], payments: [],
      commitments: [salaryPlan({ linkedEntityType: undefined, linkedEntityId: undefined })],
      payouts: [anaPayout(300_000)],
      asOfISO: '2026-06-22',
    })
    expect(model.egresosPendientes.total).toEqual({ ARS: 600_000 })
  })

  it('serves two plans on one person without either double-claiming the money', () => {
    const model = buildPositionModel({
      accounts, receivables: [], payments: [],
      commitments: [salaryPlan({ id: 'a', amount: 200_000 }), salaryPlan({ id: 'b', amount: 200_000 })],
      payouts: [anaPayout(300_000)],
      asOfISO: '2026-06-22',
    })
    expect(model.egresosPendientes.total).toEqual({ ARS: 400_000 })
  })

  it('nets an abono in the register against that client’s own cobro', () => {
    const model = buildPositionModel({
      accounts,
      receivables: [makeReceivable({ clientId: 'cli-1', clientName: 'Estudio Uno', totalAmount: 450_000, collectedAmount: 0 })],
      payments: [],
      commitments: [
        makeItem({
          id: 'abono', description: 'Abono Estudio Uno', direction: 'inflow',
          category: 'retainer', amount: 450_000,
          linkedEntityType: 'client', linkedEntityId: 'cli-1',
        }),
      ],
      asOfISO: '2026-06-22',
    })
    expect(model.ingresosPendientes.total).toEqual({ ARS: 450_000 })
  })
})

describe('buildPositionModel across currency lanes', () => {
  const accounts: Account[] = [
    { id: 'op1', name: 'Banco A', partner: 'vicky', type: 'bank', balances: { ARS: 1_000, USD: 50 }, isActive: true },
  ]
  const base = { accounts, commitments: [] as CommittedItem[], asOfISO: '2026-06-22' }

  it('puts a dollar pago in the dollar column, not the peso one', () => {
    const model = buildPositionModel({
      ...base,
      receivables: [],
      payments: [makePayment({ id: 'p-usd', recipientName: 'Figma', currency: 'USD', totalAmount: 80 })],
    })

    expect(model.egresosPendientes.total).toEqual({ USD: 80 })
    expect(model.posicion).toEqual({ ARS: 1_000, USD: -30 })
  })

  it('keeps one counterparty owed in two lanes as two rows', () => {
    const model = buildPositionModel({
      ...base,
      receivables: [],
      payments: [
        makePayment({ id: 'p-ars', recipientName: 'Estudio X', currency: 'ARS', totalAmount: 500 }),
        makePayment({ id: 'p-usd', recipientName: 'Estudio X', currency: 'USD', totalAmount: 40 }),
      ],
    })

    const rows = model.egresosPendientes.rows.filter((row) => row.label === 'Estudio X')
    expect(rows).toHaveLength(2)
    expect(new Set(rows.map((row) => row.id)).size).toBe(2)
    expect(model.egresosPendientes.total).toEqual({ ARS: 500, USD: 40 })
  })

  it('does not let a dollar pago consume a peso commitment for the same counterparty', () => {
    const model = buildPositionModel({
      ...base,
      receivables: [],
      payments: [
        makePayment({ id: 'p-usd', recipientName: 'Prov', providerId: 'prov-1', currency: 'USD', totalAmount: 40 }),
      ],
      commitments: [
        makeItem({
          id: 'ars-commit',
          direction: 'outflow',
          currency: 'ARS',
          amount: 300_000,
          linkedEntityType: 'provider',
          linkedEntityId: 'prov-1',
        }),
      ],
    })

    expect(model.egresosPendientes.rows.find((row) => row.id === 'ars-commit')?.balances).toEqual({
      ARS: 300_000,
    })
  })

  it('still nets a peso pago against a peso commitment for the same counterparty', () => {
    const model = buildPositionModel({
      ...base,
      receivables: [],
      payments: [
        makePayment({ id: 'p-ars', recipientName: 'Prov', providerId: 'prov-1', currency: 'ARS', totalAmount: 100_000 }),
      ],
      commitments: [
        makeItem({
          id: 'ars-commit',
          direction: 'outflow',
          currency: 'ARS',
          amount: 300_000,
          linkedEntityType: 'provider',
          linkedEntityId: 'prov-1',
        }),
      ],
    })

    expect(model.egresosPendientes.rows.find((row) => row.id === 'ars-commit')?.balances).toEqual({
      ARS: 200_000,
    })
  })

  it('puts a dollar cobro in the dollar column', () => {
    const model = buildPositionModel({
      ...base,
      receivables: [makeReceivable({ id: 'r-usd', clientName: 'Fondo', currency: 'USD', totalAmount: 900 })],
      payments: [],
    })

    expect(model.ingresosPendientes.total).toEqual({ USD: 900 })
  })
})

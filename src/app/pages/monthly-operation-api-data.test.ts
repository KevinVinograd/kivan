import { describe, expect, it } from 'vitest'

import type { PlanBundleDto, ProductionDto } from '@/api/monthly'
import type { PayoutStatementDto } from '@/api/payouts'
import type { ReceivableDto } from '@/api/receivables'
import { bundleToMonthData } from './monthly-operation-api-data'
import { closeBlockers } from './monthly-operation-format'

function receivableDto(overrides: Partial<ReceivableDto> = {}): ReceivableDto {
  return {
    id: 'rec-1',
    clientId: 'cli-1',
    clientName: 'Estudio Uno',
    source: 'manual',
    treasuryAccountId: null,
    treasuryAccountName: null,
    businessName: null,
    taxId: null,
    contactName: null,
    period: '2026-06',
    service: 'Contabilidad',
    baseAmountMinor: '150000',
    extraAmountMinor: '0',
    discountAmountMinor: '0',
    totalAmountMinor: '150000',
    collectedAmountMinor: '0',
    outstandingMinor: '150000',
    currency: 'ARS',
    dueDate: '2026-06-30',
    collectedAt: null,
    status: 'pending',
    billingStatus: 'no_invoice',
    emitterId: null,
    emitterCode: null,
    invoiceNumber: null,
    cae: null,
    invoiceIssuedAt: null,
    reviewStatus: null,
    effectiveDate: null,
    planNotes: null,
    extras: [],
    costDesignMinor: '0',
    costCommMinor: '0',
    costProductionMinor: '0',
    costViaticsMinor: '0',
    costPautaMinor: '0',
    costFixedMinor: '0',
    version: 0,
    createdAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  }
}

function productionDto(overrides: Partial<ProductionDto> = {}): ProductionDto {
  return {
    id: 'prod-1',
    period: '2026-06',
    date: '2026-06-05',
    clientId: 'cli-1',
    clientName: 'Estudio Uno',
    title: 'Cierre mensual',
    type: 'servicio',
    responsible: null,
    participants: [],
    hours: 4,
    viaticsMinor: '0',
    totalCostMinor: '0',
    billable: null,
    billAmountMinor: null,
    status: 'pending',
    notes: null,
    attribution: [],
    version: 0,
    ...overrides,
  }
}

function payoutDto(overrides: Partial<PayoutStatementDto> = {}): PayoutStatementDto {
  return {
    id: 'po-1',
    teamMemberId: 'tm-mica',
    period: '2026-06',
    baseAmountMinor: '80000000',
    productionsAmountMinor: '0',
    viaticsAmountMinor: '0',
    adjustmentsTotalMinor: '0',
    totalAmountMinor: '80000000',
    paidAmountMinor: '0',
    outstandingMinor: '80000000',
    // null on both = NOT RECORDED, the default for every statement predating
    // attribution. Overridden per-test where hours matter.
    hoursTotal: null,
    hourlyRateMinor: null,
    statementStatus: 'draft',
    bankId: null,
    bankProfile: null,
    dueDate: null,
  paidAt: null,
    approvedAt: null,
    approvedByUserId: null,
    version: 0,
    createdAt: '2026-06-01T00:00:00.000Z',
    adjustments: [],
    ...overrides,
  }
}

function bundle(overrides: Partial<PlanBundleDto> = {}): PlanBundleDto {
  return {
    period: '2026-06',
    status: 'draft',
    checklist: {},
    truncated: false,
    receivables: [],
    payouts: [],
    productions: [],
    expenses: [],
    alerts: [],
    monotributo: [],
    members: [],
    ...overrides,
  }
}

describe('bundleToMonthData — per-client production rollups', () => {
  it('sums productionsAmount from BILLABLE productions only, but productionCost from ALL', () => {
    const b = bundle({
      receivables: [receivableDto({ clientId: 'cli-1' })],
      productions: [
        // Billable → contributes to productionsAmount AND cost.
        productionDto({ id: 'p1', clientId: 'cli-1', billable: 'billable', billAmountMinor: '100000', totalCostMinor: '30000' }),
        // Internal (not billable) → contributes to cost ONLY.
        productionDto({ id: 'p2', clientId: 'cli-1', billable: 'internal', billAmountMinor: null, totalCostMinor: '20000' }),
        // 'both' also counts toward the billable amount.
        productionDto({ id: 'p3', clientId: 'cli-1', billable: 'both', billAmountMinor: '50000', totalCostMinor: '10000' }),
      ],
    })
    const client = bundleToMonthData(b).clients[0]
    // productionsAmount = billable(1000) + both(500) = 1500 (internal excluded).
    expect(client.productionsAmount).toBe(1500)
    // productionCost = 300 + 200 + 100 = 600 (ALL productions).
    expect(client.productionCost).toBe(600)
    // teamCost is null, not 0: the bundle does not allocate payroll per client, and
    // "unknown" must stay distinct from "no team cost" or the margin overstates profit.
    expect(client.teamCost).toBeNull()
  })

  it('attributes rollups to the correct client and ignores clientless productions', () => {
    const b = bundle({
      receivables: [receivableDto({ id: 'r1', clientId: 'cli-1' }), receivableDto({ id: 'r2', clientId: 'cli-2', clientName: 'Dos' })],
      productions: [
        productionDto({ clientId: 'cli-2', billable: 'billable', billAmountMinor: '70000', totalCostMinor: '5000' }),
        // No clientId → contributes to nobody.
        productionDto({ clientId: null, billable: 'billable', billAmountMinor: '999999', totalCostMinor: '99999' }),
      ],
    })
    const [one, two] = bundleToMonthData(b).clients
    expect(one.productionsAmount).toBe(0)
    expect(one.productionCost).toBe(0)
    expect(two.productionsAmount).toBe(700)
    expect(two.productionCost).toBe(50)
  })

  it('does not count a production already billed on a cobro', () => {
    // Its amount is inside that cobro's base, which the row already shows as its fee.
    const b = bundle({
      receivables: [receivableDto({ clientId: 'cli-1' })],
      productions: [
        productionDto({ id: 'p1', billable: 'billable', billAmountMinor: '100000', receivableId: 'rec-x' }),
        productionDto({ id: 'p2', billable: 'billable', billAmountMinor: '50000', receivableId: null }),
      ],
    })
    expect(bundleToMonthData(b).clients[0]!.productionsAmount).toBe(500)
  })

  it('puts a client rollup on ONE of its cobros, the retainer first', () => {
    // A client with an anticipo AND the month retainer used to have its productions
    // counted once per cobro in the month's "Total a facturar".
    const b = bundle({
      receivables: [
        receivableDto({ id: 'anticipo', clientId: 'cli-1', source: 'one_time' }),
        receivableDto({ id: 'abono', clientId: 'cli-1', source: 'monthly_fee' }),
      ],
      productions: [
        productionDto({ billable: 'billable', billAmountMinor: '100000', totalCostMinor: '30000' }),
      ],
    })
    const clients = bundleToMonthData(b).clients
    expect(clients.map((c) => [c.id, c.productionsAmount, c.productionCost])).toEqual([
      ['anticipo', 0, 0],
      ['abono', 1000, 300],
    ])
  })
})

describe('bundleToMonthData — enum reconciliation', () => {
  it('maps billing status → invoice status and collection status → payment status', () => {
    const b = bundle({
      receivables: [
        receivableDto({ billingStatus: 'invoiced', status: 'collected' }),
      ],
    })
    const c = bundleToMonthData(b).clients[0]
    expect(c.invoiceStatus).toBe('issued')
    expect(c.paymentStatus).toBe('paid')
  })

  it('defaults unknown review status to pending_review and unknown emitter to monotributo_1', () => {
    const c = bundleToMonthData(bundle({ receivables: [receivableDto({ reviewStatus: 'zzz', emitterCode: null })] }))
      .clients[0]
    expect(c.monthStatus).toBe('pending_review')
    expect(c.monotributo).toBe('monotributo_1')
  })
})

describe('bundleToMonthData — payouts and monotributo', () => {
  it('resolves the payout member name from the members map and carries the statement status', () => {
    const b = bundle({
      members: [{ id: 'tm-mica', name: 'Micaela Duarte', role: 'Contadora' }],
      payouts: [payoutDto({ teamMemberId: 'tm-mica', statementStatus: 'approved', totalAmountMinor: '80000000', paidAmountMinor: '80000000' })],
    })
    const payout = bundleToMonthData(b).team[0]
    expect(payout.name).toBe('Micaela Duarte')
    expect(payout.role).toBe('Contadora')
    expect(payout.statementStatus).toBe('approved')
    // Fully paid → payoutStatus paid.
    expect(payout.payoutStatus).toBe('paid')
  })

  // The two late states used to collapse into one view value ('sent'), which left the
  // UI unable to tell which transition the server would accept next.
  it('keeps dispatched and confirmed distinct', () => {
    const dispatched = bundleToMonthData(
      bundle({ payouts: [payoutDto({ statementStatus: 'dispatched' })] }),
    ).team[0]
    const confirmed = bundleToMonthData(
      bundle({ payouts: [payoutDto({ statementStatus: 'confirmed' })] }),
    ).team[0]
    expect(dispatched.statementStatus).toBe('dispatched')
    expect(confirmed.statementStatus).toBe('confirmed')
  })

  // The bundle is the one payout read with no response schema, so an unrecognized
  // status must land on the LEAST advanced state. Falling back forward would render
  // "Confirmada" over a payment nobody made.
  it('falls back to draft for an unknown statement status', () => {
    // Cast: the DTO type says this cannot happen, and the point of the test is that
    // the runtime does not trust the type on the one read that is never validated.
    const rogue = payoutDto({ statementStatus: 'zzz' as PayoutStatementDto['statementStatus'] })
    expect(bundleToMonthData(bundle({ payouts: [rogue] })).team[0].statementStatus).toBe('draft')
  })

  it('falls back to a placeholder name for an unknown member', () => {
    const payout = bundleToMonthData(bundle({ payouts: [payoutDto({ teamMemberId: 'ghost' })] })).team[0]
    expect(payout.name).toBe('Sin nombre')
  })

  it('drops monotributo watch rows with an unknown category code', () => {
    const b = bundle({
      monotributo: [
        { code: 'monotributo_2', label: 'B', annualBilledMinor: '100000', annualLimitMinor: '500000' },
        { code: 'not_a_category', label: 'X', annualBilledMinor: '1', annualLimitMinor: '2' },
      ],
    })
    const watch = bundleToMonthData(b).monotributo
    expect(watch).toHaveLength(1)
    expect(watch[0].category).toBe('monotributo_2')
  })
})

/**
 * The month has to be CLOSEABLE.
 *
 * `closeBlockers` raises `payment_incomplete` ("Cobros sin monto o fecha") for any client
 * marked paid or partial whose `paymentDate` is missing. `clientFromReceivable` never
 * mapped it, so that blocker fired for every collected client, on every month, and could
 * not be resolved from the UI — the operator is told to fix a date that is already stored.
 *
 * The existing suite could not catch it: `monthly-operation-format.test.ts` builds its
 * ClientMonth fixtures by hand WITH a `paymentDate`, so it only ever exercised the blocker
 * against data the mapper does not produce. This test starts from a ReceivableDto — the
 * shape the API actually returns — which is the half that was never covered.
 */
describe('a collected month can be closed', () => {
  const collected = (over: Partial<ReceivableDto> = {}): ReceivableDto =>
    receivableDto({
      status: 'collected',
      collectedAmountMinor: '150000',
      outstandingMinor: '0',
      // As the API serializes it: a UTC midnight instant, not a date-only string.
      collectedAt: '2026-06-18T00:00:00.000Z',
      ...over,
    })

  it('carries the collection date onto the client month', () => {
    const data = bundleToMonthData(bundle({ receivables: [collected()] }))
    expect(data.clients[0]?.paymentStatus).toBe('paid')
    // Date part only. Formatting the instant locally at UTC-3 would render the 17th.
    expect(data.clients[0]?.paymentDate).toBe('2026-06-18')
  })

  it('raises no payment_incomplete blocker for a collected client', () => {
    // The regression, stated as the operator experiences it: 94% collected, one
    // validation open, and no way to clear it.
    const data = bundleToMonthData(bundle({ receivables: [collected()] }))
    const ids = closeBlockers(data).map((b) => b.id)
    expect(ids).not.toContain('payment_incomplete')
  })

  it('still raises it when the collection genuinely has no date', () => {
    // The blocker has to keep working — it is a real condition, just not the one every
    // collected client was being accused of.
    const data = bundleToMonthData(bundle({ receivables: [collected({ collectedAt: null })] }))
    const ids = closeBlockers(data).map((b) => b.id)
    expect(ids).toContain('payment_incomplete')
  })
})

describe('a truncated month cannot be closed', () => {
  it('blocks the close when the API says the bundle is partial', () => {
    // Every figure on the page — revenue, profitability, and the OTHER blockers — is
    // computed over whatever rows arrived. A clean checklist over a subset is a clean
    // checklist for part of the month, and closing freezes it into a snapshot.
    const data = bundleToMonthData(bundle({ truncated: true }))
    expect(closeBlockers(data).map((b) => b.id)).toContain('bundle_truncated')
  })

  it('does not block when the bundle is complete', () => {
    expect(closeBlockers(bundleToMonthData(bundle())).map((b) => b.id)).not.toContain(
      'bundle_truncated',
    )
  })

  it('reads an API that predates the flag as complete', () => {
    // Deploy Web and Deploy API fire independently. Defaulting the other way would raise
    // this blocker on every month the moment the browser updates ahead of the API.
    const { truncated: _omitted, ...older } = bundle()
    const data = bundleToMonthData(older as PlanBundleDto)
    expect(data.truncated).toBe(false)
    expect(closeBlockers(data).map((b) => b.id)).not.toContain('bundle_truncated')
  })
})

/**
 * Row identity: `clientId` is NOT unique within a month.
 *
 * `data.clients` is one row per RECEIVABLE, and two cobros for one client in one month are
 * a supported shape (the generator blocks only a second `monthly_fee` row; hand-made
 * duplicates are legitimate). Every mutation on the monthly page therefore has to be keyed
 * on the row `id`. Keyed on `clientId`, the lookup is an `Array.find` over a non-unique
 * field and silently resolves the FIRST row, so a cobro registered against the second one
 * lands on the first, reports success, and leaves the close blocker it was clearing on
 * screen. Both fields are `string`, so nothing in the type system objects.
 *
 * This test pins that premise.
 */
describe('two cobros for one client in one month', () => {
  const twoRows = bundle({
    receivables: [
      receivableDto({ id: 'rec-a', clientId: 'cli-1', service: 'Contabilidad' }),
      receivableDto({ id: 'rec-b', clientId: 'cli-1', service: 'Auditoria' }),
    ],
  })

  it('maps to two distinct rows that share one clientId', () => {
    const data = bundleToMonthData(twoRows)
    expect(data.clients).toHaveLength(2)
    expect(data.clients.map((c) => c.id)).toEqual(['rec-a', 'rec-b'])
    // The field a mutation must NOT be keyed on.
    expect(new Set(data.clients.map((c) => c.clientId)).size).toBe(1)
  })

  it('resolves the second row by id, where a clientId lookup returns the first', () => {
    const data = bundleToMonthData(twoRows)
    expect(data.clients.find((c) => c.id === 'rec-b')?.id).toBe('rec-b')
    expect(data.clients.find((c) => c.clientId === 'cli-1')?.id).toBe('rec-a')
  })
})

/**
 * The month's cost side arrives from the Pagos module.
 *
 * Two fields, and the distinction is the whole point: `paymentTotals` is an exact aggregate
 * computed server-side over every row of the period, and `payments` is a page of rows for
 * display. Deriving money from the ROWS is the defect this shape exists to prevent — the
 * bundle already caps its lists, so a month past the cap would understate its own costs and
 * overstate its profit, on the figure the operator signs off at close.
 */
describe('payments in the bundle', () => {
  it('maps totals and rows independently', () => {
    const data = bundleToMonthData(
      bundle({
        paymentTotals: [
          { recipientType: 'collaborator', totalMinor: '40000000', paidMinor: '15000000', count: 3 },
          { recipientType: 'fixed_expense', totalMinor: '9000000', paidMinor: '9000000', count: 2 },
        ],
        payments: [
          {
            id: 'pay-1',
            recipientType: 'collaborator',
            recipientName: 'Mica',
            concept: 'Honorarios agosto',
            totalMinor: '20000000',
            paidMinor: '20000000',
            status: 'paid',
            expectedDate: '2026-06-10',
            paymentDate: '2026-06-12',
          },
        ],
      }),
    )

    expect(data.paymentTotals).toEqual([
      { recipientType: 'collaborator', total: 400_000, paid: 150_000, count: 3 },
      { recipientType: 'fixed_expense', total: 90_000, paid: 90_000, count: 2 },
    ])
    // Five rows recorded, one carried: the totals stay whole.
    expect(data.payments).toHaveLength(1)
    expect(data.payments[0]?.total).toBe(200_000)
    expect(data.payments[0]?.paymentDate).toBe('2026-06-12')
  })

  it('reads a bundle without the fields as a month with no outflows', () => {
    // The deploy-skew window: a browser ahead of the API must render the month it always
    // rendered, not crash on a field that is not there yet.
    const data = bundleToMonthData(bundle({}))
    expect(data.paymentTotals).toEqual([])
    expect(data.payments).toEqual([])
  })
})

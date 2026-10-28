import { describe, expect, it } from 'vitest'

import { isCalendarDay } from '@/app/lib/iso-date'
import {
  cobrosKpis,
  COBROS_HERO_IDS,
  receivableActivity,
  receivableInvoiceDate,
  receivableLedger,
  receivableRegisteredPayments,
  effectiveCollectionStatus,
} from './cobros-format'
import { LANE_NOUN } from '@/lib/currency'

import type { Receivable } from './cobros-mock-data'

function makeReceivable(partial: Partial<Receivable>): Receivable {
  return {
    id: 'b6f1c2d4-0000-4000-8000-000000000007',
    clientName: 'Cliente',
    period: '2026-08-01',
    service: 'Redes',
    baseAmount: 0,
    extraAmount: 0,
    extras: [],
    discountAmount: 0,
    totalAmount: 0,
    collectedAmount: 0,
    currency: 'ARS',
    dueDate: '2026-08-25',
    status: 'pending',
    billingStatus: 'no_invoice',
    taxProfileId: 'unassigned',
    lastActivityLabel: '',
    lastActivityAt: '2026-08-02T14:00:00.000Z',
    ...partial,
  }
}

/**
 * The defect these pin: the row used to carry a medio de pago picked from a three-item list
 * by the digits of the receivable id, rendered as the row's PRIMARY line next to a real
 * amount, on live API-backed receivables. Nobody had entered it, and the receivable has no
 * payment-method column at any layer. Same for the `REC-0000` reference.
 *
 * Written because `cobros-format.ts` had no test file, so the highest-value fix in its PR
 * was the only one without a regression guard.
 */
describe('receivableRegisteredPayments', () => {
  it('returns no row when nothing has been collected', () => {
    expect(receivableRegisteredPayments(makeReceivable({ collectedAmount: 0 }))).toEqual([])
  })

  it('never returns a payment method, whatever the id digits would have selected', () => {
    // Three ids whose digit-sums land on each of the three methods the old list held.
    for (const id of ['rec-001', 'rec-002', 'rec-003']) {
      const [row] = receivableRegisteredPayments(makeReceivable({ id, collectedAmount: 500 }))
      expect(row).not.toHaveProperty('method')
      expect(JSON.stringify(row)).not.toMatch(/Transferencia|Mercado Pago|Efectivo/)
    }
  })

  it('carries the real comprobante number, and nothing when there is none', () => {
    const [withInvoice] = receivableRegisteredPayments(
      makeReceivable({ collectedAmount: 500, invoiceNumber: '0001-00000042' }),
    )
    expect(withInvoice.reference).toBe('0001-00000042')

    const [without] = receivableRegisteredPayments(makeReceivable({ collectedAmount: 500 }))
    expect(without.reference).toBeUndefined()
    // The old code synthesized `REC-0007` here, from the digits of the id.
    expect(JSON.stringify(without)).not.toMatch(/REC-\d/)
  })

  it('dates the row by collectedAt, as a calendar day', () => {
    const [row] = receivableRegisteredPayments(
      makeReceivable({ collectedAmount: 500, collectedAt: '2026-08-18', lastActivityAt: '2026-08-02T14:00:00.000Z' }),
    )
    expect(row.iso).toBe('2026-08-18')
    expect(isCalendarDay(row.iso!)).toBe(true)
  })

  it('carries NO date for a row collected before the column shipped', () => {
    // It used to fall back to `lastActivityAt` — the row's createdAt — and the detail
    // rendered it to the minute ("14 ago 2026, 09:00"), a far more confident claim about
    // when the money arrived than the Actividad timeline makes about the same event.
    // The amount is real and still shown; the day is not, and is not invented.
    const [row] = receivableRegisteredPayments(
      makeReceivable({ collectedAmount: 500, collectedAt: undefined }),
    )
    expect(row.iso).toBeUndefined()
    expect(row.amount).toBe(500)
  })

  it('reports the full collected amount as one row', () => {
    const [row] = receivableRegisteredPayments(makeReceivable({ totalAmount: 1_000, collectedAmount: 400 }))
    expect(row.amount).toBe(400)
    // One running total and one date per receivable, so N partial collections still collapse
    // into a single line until a per-settlement table exists.
    expect(receivableRegisteredPayments(makeReceivable({ collectedAmount: 400 }))).toHaveLength(1)
  })
})

/**
 * The Actividad timeline and the "Cobros registrados" row describe the SAME event, so they
 * must not disagree. Both used to read `lastActivityAt`, which `dtoToReceivable` sets to the
 * row's createdAt — agreeing, but on the wrong day. Fixing only the row would have put two
 * different dates for one collection in the same panel.
 */
describe('receivableActivity', () => {
  it('dates the collection entry by collectedAt, matching the Cobros registrados row', () => {
    const r = makeReceivable({
      collectedAmount: 500,
      collectedAt: '2026-08-18',
      lastActivityAt: '2026-08-01T09:00:00.000Z',
    })
    const entry = receivableActivity(r).find((item) => item.kind === 'collected')
    const [row] = receivableRegisteredPayments(r)

    expect(entry?.iso).toBe('2026-08-18')
    expect(entry?.iso).toBe(row.iso)
    // A calendar day, so the timeline renders the day rather than a distance from midnight.
    expect(isCalendarDay(entry!.iso)).toBe(true)
  })

  it('omits the collection entry when no collection date was recorded', () => {
    // `lastActivityAt` is the row's createdAt, so using it as a fallback stamped the
    // collection with the day the cobro was OPENED — an event that necessarily predates
    // the money arriving. A timeline is a claim about when things happened; the amount
    // stays visible in "Cobros registrados" and in the KPI, it just stops asserting a day.
    const entry = receivableActivity(
      makeReceivable({ collectedAmount: 500, collectedAt: undefined, lastActivityAt: '2026-08-01T09:00:00.000Z' }),
    ).find((item) => item.kind === 'collected')

    expect(entry).toBeUndefined()
  })

  it('dates "Cobro creado" at the creation instant, not at the billing month', () => {
    const entry = receivableActivity(
      makeReceivable({ period: '2026-08-01', lastActivityAt: '2026-08-14T09:00:00.000Z' }),
    ).find((item) => item.kind === 'created')

    // `r.period` is the month being billed. Reading it as the creation day put the entry
    // on the 1st for every cobro in the month, whatever day it was actually opened.
    // Normalized to a day so the timeline does not mix "hace 5 días" with "12 ago".
    expect(entry?.iso).toBe('2026-08-14')
  })

  it('emits no invoice entry, and no invoice date, without a stored emission date', () => {
    // The old fallback was `lastActivityAt` minus two days: an emission date two days
    // before the cobro existed, printed beside a real comprobante number.
    const r = makeReceivable({ invoiceNumber: 'A-0001-00000123', invoiceIssuedAt: undefined })

    expect(receivableInvoiceDate(r)).toBeUndefined()
    expect(receivableActivity(r).some((item) => item.kind === 'invoice')).toBe(false)
  })

  it('orders a later collection day above an earlier invoice instant', () => {
    // The ordering that the data actually supports. A raw lexicographic sort over mixed
    // shapes is not simply "wrong within a day" — it ranks a date-only value below ANY
    // instant it shares a prefix with, and the collection used to be dated by createdAt
    // (the 1st), which buried it under everything.
    const items = receivableActivity(
      makeReceivable({
        collectedAmount: 500,
        collectedAt: '2026-08-18',
        invoiceNumber: '0001-00000042',
        invoiceIssuedAt: '2026-08-17T10:00:00.000Z',
        lastActivityAt: '2026-08-01T09:00:00.000Z',
      }),
    )
    const collectedIndex = items.findIndex((item) => item.kind === 'collected')
    const invoiceIndex = items.findIndex((item) => item.kind === 'invoice')
    expect(collectedIndex).toBeGreaterThanOrEqual(0)
    expect(invoiceIndex).toBeGreaterThanOrEqual(0)
    expect(collectedIndex).toBeLessThan(invoiceIndex)
  })

  it('leaves same-day order to the raw value, which a calendar day cannot settle', () => {
    // Deliberately NOT asserted the other way: `collectedAt` carries no time of day, so
    // nothing in the data says whether the collection preceded or followed a factura
    // issued at 10:00 the same morning. Pinning an order here would pin an invention.
    const items = receivableActivity(
      makeReceivable({
        collectedAmount: 500,
        collectedAt: '2026-08-18',
        invoiceNumber: '0001-00000042',
        invoiceIssuedAt: '2026-08-18T10:00:00.000Z',
        lastActivityAt: '2026-08-01T09:00:00.000Z',
      }),
    )
    const days = items.map((item) => item.iso.slice(0, 10))
    // What IS guaranteed: same-day entries stay adjacent, ordered newest day first.
    expect([...days].sort().reverse()).toEqual(days)
  })
})

describe('receivableLedger', () => {
  const august = makeReceivable({
    id: 'rec-004',
    clientId: 'cli-1',
    period: '2026-08-01',
    totalAmount: 90_000,
    collectedAmount: 0,
  })

  it('carries what the client still owes from EARLIER periods, and nothing else', () => {
    const ledger = receivableLedger(august, [
      august,
      // Earlier and unpaid -> carried.
      makeReceivable({ id: 'rec-001', clientId: 'cli-1', period: '2026-06-01', totalAmount: 50_000, collectedAmount: 20_000 }),
      // Earlier and settled -> contributes nothing.
      makeReceivable({ id: 'rec-002', clientId: 'cli-1', period: '2026-07-01', totalAmount: 40_000, collectedAmount: 40_000 }),
      // Earlier, unpaid, but ANOTHER client.
      makeReceivable({ id: 'rec-003', clientId: 'cli-2', period: '2026-07-01', totalAmount: 70_000, collectedAmount: 0 }),
      // LATER than the one being viewed -> not "previous".
      makeReceivable({ id: 'rec-005', clientId: 'cli-1', period: '2026-09-01', totalAmount: 10_000, collectedAmount: 0 }),
    ])

    expect(ledger.previousBalance).toBe(30_000)
    expect(ledger.currentBalance).toBe(120_000)
  })

  it('reads 0 for a client with no earlier debt, whatever the row id digits are', () => {
    // THE regression guard. This used to be `seedOf(r) % 4 === 0 ? totalAmount * 0.25 : 0`,
    // so one cobro in four displayed a carried debt computed from the DIGITS OF ITS ID,
    // in a money column beside real figures. `rec-004` is one of the ids that triggered it.
    expect(receivableLedger(august, [august]).previousBalance).toBe(0)
  })

  it('ignores a cancelled earlier cobro', () => {
    const ledger = receivableLedger(august, [
      august,
      makeReceivable({ id: 'rec-006', clientId: 'cli-1', period: '2026-07-01', totalAmount: 80_000, collectedAmount: 0, status: 'cancelled' }),
    ])
    expect(ledger.previousBalance).toBe(0)
  })
})

describe('receivableLedger — an over-collected earlier cobro', () => {
  it('does not net a negative balance off real debt from another period', () => {
    const august = makeReceivable({ id: 'rec-x', clientId: 'cli-1', period: '2026-08-01', totalAmount: 90_000 })
    const ledger = receivableLedger(august, [
      august,
      // Over-collected: the total was edited down after the money came in.
      makeReceivable({ id: 'rec-o', clientId: 'cli-1', period: '2026-06-01', totalAmount: 50_000, collectedAmount: 80_000 }),
      makeReceivable({ id: 'rec-d', clientId: 'cli-1', period: '2026-07-01', totalAmount: 40_000, collectedAmount: 0 }),
    ])
    // 40.000 is owed. Summing the raw balances would report 10.000 and understate the debt.
    expect(ledger.previousBalance).toBe(40_000)
  })
})

/**
 * The resumen figures, on a roster that holds more than one currency.
 *
 * A cobro is billed in its client's own lane. `dtoToReceivable` used to relabel every
 * row 'ARS', so `cobrosKpis` added dollars to "Total a cobrar" under a "$" — a peso total
 * carrying an amount that was never pesos.
 */
describe('cobrosKpis across currency lanes', () => {
  const figure = (figures: ReturnType<typeof cobrosKpis>, id: string) =>
    figures.find((kpi) => kpi.id === id)

  const peso = makeReceivable({ id: 'ars-1', totalAmount: 100_000, collectedAmount: 25_000 })

  it('leaves every peso figure unchanged when a dollar cobro joins the period', () => {
    const pesoOnly = cobrosKpis([peso])
    const mixed = cobrosKpis([
      peso,
      makeReceivable({ id: 'usd-1', currency: 'USD', totalAmount: 900 }),
    ])

    for (const id of [
      'toCollect',
      'collected',
      'pending',
      'overdue',
      'toInvoice',
      'billedNotCollected',
    ]) {
      expect(figure(mixed, id)?.value).toBe(figure(pesoOnly, id)?.value)
    }
  })

  it('holds the pair plus five, whatever the period contains', () => {
    // A fixed shape: two heroes and five supporting figures, always. The count is
    // load-bearing twice — the supporting grid is sized from it and `CobranzaLoading`'s
    // skeleton is built to match, so a figure that came and went with the data would
    // shift the layout on every load.
    const mixed = cobrosKpis([peso, makeReceivable({ id: 'usd-1', currency: 'USD' })])
    expect(mixed).toHaveLength(7)
    expect(cobrosKpis([peso])).toHaveLength(7)
    expect(cobrosKpis([makeReceivable({ id: 'usd-1', currency: 'USD' })])).toHaveLength(7)
    // "Total a cobrar" stayed in the supporting grid and is still peso-scoped, so it
    // keeps the hint that says so — it is not one of the two heroes.
    expect(figure(mixed, 'toCollect')?.hint).toBe('en pesos')
  })
})

/**
 * The LANE PAIR, the /cobros twin of the one in `pagos-format.test.ts`. Same rule, and it
 * has to STAY the same: these two screens read the same kind of row for the same period,
 * and the last time one of them was given a lane rule the other did not have, the result
 * was two screens stating different amounts for one month.
 *
 * What is specific here is WHICH measure the pair states. This screen's hero has always
 * been Saldo pendiente, not the period total, so the dollar twin mirrors that — pairing
 * "Saldo pendiente" with "Total a cobrar" would put two different questions at identical
 * weight, which is worse than the smaller-aside layout it replaces.
 */
describe('the lane pair', () => {
  const peso = makeReceivable({ id: 'ars-1', totalAmount: 100_000 })
  const NBSP = String.fromCharCode(160)
  const plain = (s: string | undefined) => s?.split(NBSP).join(' ')
  const figureOf = (figures: ReturnType<typeof cobrosKpis>, id: string) =>
    figures.find((k) => k.id === id)

  it('names both heroes as ids that exist in the list the card is handed', () => {
    // `KpiSummaryCard` degrades to one hero on an unmatched id, silently and with the
    // whole suite green. This is what ties the two halves together.
    const figures = cobrosKpis([peso, makeReceivable({ id: 'usd-1', currency: 'USD' })])
    expect(COBROS_HERO_IDS.every((id) => figureOf(figures, id) != null)).toBe(true)
    expect(figures.slice(0, 2).map((k) => k.id)).toEqual([...COBROS_HERO_IDS])
  })

  it('states the SALDO in each lane, not the period total', () => {
    const figures = cobrosKpis([
      peso,
      makeReceivable({ id: 'usd-1', currency: 'USD', totalAmount: 900, collectedAmount: 400 }),
      makeReceivable({ id: 'usd-2', currency: 'USD', totalAmount: 100 }),
    ])

    expect(figureOf(figures, 'pendingARS')?.label).toBe('Saldo pendiente en pesos')
    expect(figureOf(figures, 'pendingUSD')?.label).toBe('Saldo pendiente en dólares')
    // 900 - 400 collected, plus 100 = 600 outstanding. The PERIOD TOTAL would be 1.000,
    // which is the figure the old lane card showed and the wrong pair for this hero.
    expect(plain(figureOf(figures, 'pendingUSD')?.value)).toBe('US$ 600')
    expect(figureOf(figures, 'pendingUSD')?.hint).toBe('2 cobros')
  })

  it('escalates each lane on ITS OWN money, not on the other one', () => {
    // The convention rations tinted figures to one per viewport, "a second
    // only when a second value is genuinely a threshold status and Primary" — which is
    // this figure's new rank. So a peso lane at rest beside a dollar lane with an
    // outstanding balance tints only the dollar one.
    const pesoAtRest = makeReceivable({
      id: 'ars-paid', totalAmount: 100_000, collectedAmount: 100_000, status: 'collected',
    })
    // A FUTURE due date, or the row reads as overdue and the tone is danger rather than
    // the warning this case is about. The fixture's default `dueDate` is in the past.
    const owing = cobrosKpis([
      pesoAtRest,
      makeReceivable({ id: 'usd-1', currency: 'USD', totalAmount: 900, dueDate: '2099-01-31' }),
    ])

    expect(figureOf(owing, 'pendingARS')?.tone).toBe('default')
    expect(figureOf(owing, 'pendingUSD')?.tone).toBe('warning')

    // And past due, the dollar lane escalates the whole way on its own.
    const late = cobrosKpis([
      pesoAtRest,
      makeReceivable({ id: 'usd-late', currency: 'USD', totalAmount: 900, dueDate: '2026-01-31' }),
    ])
    expect(figureOf(late, 'pendingARS')?.tone).toBe('default')
    expect(figureOf(late, 'pendingUSD')?.tone).toBe('danger')

    const bothAtRest = cobrosKpis([pesoAtRest])
    expect(figureOf(bothAtRest, 'pendingUSD')?.tone).toBe('default')
  })

  it('renders US$ 0 on an empty lane, and SAYS which kind of zero it is', () => {
    // The figure used to be withheld entirely, on the argument that an empty lane is
    // EMPTY rather than zero. That is right about the FIGURE and is answered by the HINT;
    // what withholding cost was the pair, since a protagonist that vanishes some months
    // is not one.
    const empty = cobrosKpis([peso])
    expect(plain(figureOf(empty, 'pendingUSD')?.value)).toBe('US$ 0')
    expect(figureOf(empty, 'pendingUSD')?.hint).toBe('sin cobros en el período')

    const cancelled = cobrosKpis([
      peso,
      makeReceivable({ id: 'x', currency: 'USD', status: 'cancelled' }),
    ])
    expect(figureOf(cancelled, 'pendingUSD')?.hint).toBe('sin cobros en el período')
  })

  it('builds the label from the shared lane noun, so no screen can rename a lane', () => {
    // Against `LANE_NOUN`, not a hardcoded string: that is the one place a lane is named
    // and all three cards interpolate it, so pinning the label against it is what
    // actually guards the cross-screen invariant this file is named for.
    const figures = cobrosKpis([makeReceivable({ id: 'u', currency: 'USD' })])
    expect(figureOf(figures, 'pendingUSD')?.label).toBe('Saldo pendiente en ' + LANE_NOUN.USD)
  })
})

describe('effectiveCollectionStatus', () => {
  it('reads a pending cobro past its due date as overdue', () => {
    const r = makeReceivable({ status: 'pending', dueDate: '2020-01-10', totalAmount: 1000, collectedAmount: 0 })
    expect(effectiveCollectionStatus(r)).toBe('overdue')
  })

  it('keeps a pending cobro that is not due yet, and any other state as stored', () => {
    expect(effectiveCollectionStatus(makeReceivable({ status: 'pending', dueDate: '2999-01-10', totalAmount: 1000, collectedAmount: 0 }))).toBe('pending')
    expect(effectiveCollectionStatus(makeReceivable({ status: 'collected', dueDate: '2020-01-10', totalAmount: 1000, collectedAmount: 1000 }))).toBe('collected')
    expect(effectiveCollectionStatus(makeReceivable({ status: 'partial', dueDate: '2020-01-10', totalAmount: 1000, collectedAmount: 400 }))).toBe('partial')
  })
})

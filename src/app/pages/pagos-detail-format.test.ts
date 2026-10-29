import { describe, expect, it } from 'vitest'

import type { LedgerPeriodSummaryDto } from '@/api/ledger'
import type { PaymentBankDto } from '@/api/payments'
import type { PayoutStatementDto } from '@/api/payouts'
import { laneScopeHonoured } from './pagos-detail-data'
import { paymentActivity, paymentBankData, paymentDesglose, paymentLedger } from './pagos-format'
import type { Payment } from './pagos-mock-data'

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'pay-1',
    recipientName: 'Mica Torres',
    recipientType: 'collaborator',
    teamMemberId: 'tm-1',
    period: '2026-06-01',
    concept: 'Horas mensuales',
    totalAmount: 480000,
    paidAmount: 0,
    currency: 'ARS',
    expectedDate: '2026-06-30',
    status: 'pending',
    lastActivityLabel: 'Sin actividad',
    lastActivityAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  }
}

function statement(overrides: Partial<PayoutStatementDto> = {}): PayoutStatementDto {
  return {
    id: 'po-1',
    teamMemberId: 'tm-1',
    period: '2026-06-01',
    baseAmountMinor: '30000000',
    productionsAmountMinor: '15000000',
    viaticsAmountMinor: '3000000',
    adjustmentsTotalMinor: '0',
    totalAmountMinor: '48000000',
    paidAmountMinor: '0',
    outstandingMinor: '48000000',
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

const valueOf = (rows: { label: string; value: string }[], label: string) =>
  rows.find((r) => r.label === label)?.value.replace(/ /g, ' ')

describe('paymentDesglose — liquidación', () => {
  it('reads hours and rate off the statement', () => {
    const rows = paymentDesglose(
      payment(),
      statement({ hoursTotal: 42.5, hourlyRateMinor: '1200000' }),
    )
    expect(valueOf(rows, 'Horas')).toBe('42.5 h')
    expect(valueOf(rows, 'Valor hora')).toBe('$ 12.000')
  })

  it('reports unrecorded hours and rate as "Sin registro", never as zero', () => {
    const rows = paymentDesglose(payment(), statement())
    expect(valueOf(rows, 'Horas')).toBe('Sin registro')
    expect(valueOf(rows, 'Valor hora')).toBe('Sin registro')
  })

  it('itemizes each adjustment under its own reason', () => {
    const rows = paymentDesglose(
      payment(),
      statement({
        adjustments: [
          { id: 'a1', description: 'Bono producción', amountMinor: '5000000', createdAt: '' },
          { id: 'a2', description: 'Adelanto mayo', amountMinor: '-2000000', createdAt: '' },
        ],
      }),
    )
    expect(valueOf(rows, 'Bono producción')).toBe('$ 50.000')
    expect(valueOf(rows, 'Adelanto mayo')).toBe('-$ 20.000')
    expect(rows.some((r) => r.label === 'Extras')).toBe(false)
  })

  it('returns no rows for a member whose month was never liquidated', () => {
    expect(paymentDesglose(payment(), null)).toEqual([])
  })

  it('describes a proveedor from the payment itself, with no statement involved', () => {
    const rows = paymentDesglose(
      payment({ recipientType: 'provider', teamMemberId: undefined, providerId: 'pv-1' }),
      null,
    )
    expect(valueOf(rows, 'Concepto')).toBe('Horas mensuales')
    expect(rows.some((r) => r.label === 'Horas')).toBe(false)
  })

  it('no longer invents a CUIT or a category for a monotributo', () => {
    const rows = paymentDesglose(
      payment({ recipientType: 'monotributo', teamMemberId: undefined }),
      null,
    )
    expect(rows.some((r) => r.label === 'CUIT')).toBe(false)
    expect(rows.some((r) => r.label === 'Categoría')).toBe(false)
  })
})

describe('paymentBankData', () => {
  const bank: PaymentBankDto = {
    bankName: 'Banco Nación',
    accountHolder: 'Florencia Giménez',
    cbuOrCvu: '0110599520000012345678',
    alias: 'flor.gimenez',
    accountType: 'savings',
  }

  it('shows the account on file', () => {
    const rows = paymentBankData(bank)
    expect(valueOf(rows, 'Banco')).toBe('Banco Nación')
    expect(valueOf(rows, 'CBU')).toBe('0110599520000012345678')
    expect(valueOf(rows, 'Titular')).toBe('Florencia Giménez')
  })

  it('blanks every field when there is no account, inventing no digits', () => {
    const rows = paymentBankData(null)
    expect(rows.map((r) => r.value)).toEqual(['-', '-', '-', '-'])
  })

  it('leaves a partially-filled account partially blank', () => {
    const rows = paymentBankData({ ...bank, cbuOrCvu: null, accountHolder: null })
    expect(valueOf(rows, 'Banco')).toBe('Banco Nación')
    expect(valueOf(rows, 'CBU')).toBe('-')
    expect(valueOf(rows, 'Titular')).toBe('-')
  })
})

describe('paymentLedger', () => {
  const summary: LedgerPeriodSummaryDto = {
    currency: 'ARS',
    openingBalanceMinor: '12000000',
    debitMinor: '48000000',
    settledMinor: '30000000',
    creditAdjustmentsMinor: '0',
    closingBalanceMinor: '30000000',
  }

  it('converts the figures, and they still close', () => {
    const ledger = paymentLedger(summary)!
    expect(ledger.previousBalance).toBe(120000)
    expect(ledger.periodAmount).toBe(480000)
    expect(ledger.settledAmount).toBe(300000)
    expect(ledger.creditAdjustments).toBe(0)
    expect(ledger.currentBalance).toBe(300000)
    expect(
      ledger.previousBalance +
        ledger.periodAmount -
        ledger.settledAmount -
        ledger.creditAdjustments,
    ).toBe(ledger.currentBalance)
  })

  it('keeps corrections out of what was paid', () => {
    const ledger = paymentLedger({
      currency: 'ARS',
      openingBalanceMinor: '0',
      debitMinor: '100000',
      settledMinor: '0',
      creditAdjustmentsMinor: '40000',
      closingBalanceMinor: '60000',
    })!
    expect(ledger.settledAmount).toBe(0)
    expect(ledger.creditAdjustments).toBe(400)
    expect(ledger.currentBalance).toBe(600)
  })

  it('carries a negative balance through instead of clamping it', () => {
    const ledger = paymentLedger({
      currency: 'ARS',
      openingBalanceMinor: '-5000000',
      debitMinor: '0',
      settledMinor: '0',
      creditAdjustmentsMinor: '0',
      closingBalanceMinor: '-5000000',
    })!
    expect(ledger.previousBalance).toBe(-50000)
    expect(ledger.currentBalance).toBe(-50000)
  })

  it('returns null when there is no summary, so the caller cannot render zeroes', () => {
    expect(paymentLedger(null)).toBeNull()
  })
})

describe('paymentActivity', () => {
  function mkPayment(over: Partial<Payment>): Payment {
    return {
      id: 'pay-1', recipientName: 'Flor', recipientType: 'collaborator', period: '2026-08-01',
      concept: 'Diseño', totalAmount: 100_000, paidAmount: 0, currency: 'ARS',
      expectedDate: '2026-08-30', status: 'pending', lastActivityLabel: '',
      lastActivityAt: '2026-08-14T09:00:00.000Z', ...over,
    } as Payment
  }

  it('dates "Pago creado" at the creation instant, as a day, not at the billing month', () => {
    expect(paymentActivity(mkPayment({})).find((i) => i.kind === 'created')?.iso).toBe('2026-08-14')
  })

  it('emits no approval entry — nothing records when a pago was approved', () => {
    expect(paymentActivity(mkPayment({ status: 'approved' })).some((i) => i.kind === 'approved')).toBe(false)
  })

  it('emits no cancellation entry — it was stamped at creation, which it cannot be', () => {
    expect(paymentActivity(mkPayment({ status: 'cancelled' })).some((i) => i.kind === 'cancelled')).toBe(false)
  })

  it('dates the money by paymentDate, and omits the entry when none was recorded', () => {
    const dated = paymentActivity(
      mkPayment({ paidAmount: 100_000, status: 'paid', paymentDate: '2026-08-20' }),
    ).find((i) => i.kind === 'paid')
    expect(dated?.iso).toBe('2026-08-20')

    expect(
      paymentActivity(mkPayment({ paidAmount: 100_000, status: 'paid' })).some((i) => i.kind === 'paid'),
    ).toBe(false)
  })
})

describe('laneScopeHonoured', () => {
  it('trusts a lane-aware server, which announces itself with per-lane balances', () => {
    expect(laneScopeHonoured({ balancesMinor: { ARS: '300000', USD: '40000' } })).toBe(true)
    expect(laneScopeHonoured({ balancesMinor: { ARS: '300000' } })).toBe(true)
  })

  it('does not trust a scope the server never applied — pesos included', () => {
    expect(laneScopeHonoured({ balancesMinor: {} })).toBe(false)
    expect(laneScopeHonoured({})).toBe(false)
    expect(laneScopeHonoured(undefined)).toBe(false)
  })
})

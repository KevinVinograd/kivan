import { describe, expect, it } from 'vitest'

import { buildSendMessage } from './cobros-invoice'
import type { Receivable } from './cobros-mock-data'

const NBSP = String.fromCharCode(160)
const plain = (s: string) => s.split(NBSP).join(' ')

function receivable(overrides: Partial<Receivable> = {}): Receivable {
  return {
    id: 'rec-1',
    clientName: 'Cliente Uno',
    period: '2026-09-01',
    service: 'Redes',
    baseAmount: 3_500,
    extraAmount: 0,
    extras: [],
    discountAmount: 0,
    totalAmount: 3_500,
    collectedAmount: 0,
    currency: 'ARS',
    dueDate: '2026-09-25',
    status: 'pending',
    billingStatus: 'no_invoice',
    taxProfileId: 'unassigned',
    lastActivityLabel: '',
    lastActivityAt: '2026-09-02T14:00:00.000Z',
    ...overrides,
  }
}

const lineWith = (message: string, needle: string) =>
  plain(message)
    .split('\n')
    .find((line) => line.includes(needle))

describe('buildSendMessage — the factura channel', () => {
  it('quotes a peso cobro in pesos', () => {
    const message = buildSendMessage(receivable({ invoiceNumber: '0001-00000042' }), 'factura')
    expect(lineWith(message, 'factura')).toBe(
      'Te enviamos la factura 0001-00000042 por $ 3.500.',
    )
  })

  it('quotes a DOLLAR cobro in dollars, never in pesos', () => {
    const message = buildSendMessage(
      receivable({ currency: 'USD', invoiceNumber: '0001-00000042' }),
      'factura',
    )
    expect(lineWith(message, 'factura')).toBe(
      'Te enviamos la factura 0001-00000042 por US$ 3.500.',
    )
    expect(plain(message)).not.toMatch(/(?<!US)\$/)
  })
})

describe('buildSendMessage — the cuenta corriente channel', () => {
  it('states BOTH figures in the cobro lane, not just the first', () => {
    const message = buildSendMessage(
      receivable({ currency: 'USD', totalAmount: 3_500, collectedAmount: 1_000 }),
      'cuenta_corriente',
    )

    expect(lineWith(message, 'Total del período')).toBe('Total del período: US$ 3.500.')
    expect(lineWith(message, 'Saldo pendiente')).toBe('Saldo pendiente: US$ 2.500.')
    expect(plain(message)).not.toMatch(/(?<!US)\$/)
  })

  it('leaves the peso case reading exactly as it always did', () => {
    const message = buildSendMessage(
      receivable({ totalAmount: 3_500, collectedAmount: 1_000 }),
      'cuenta_corriente',
    )

    expect(lineWith(message, 'Total del período')).toBe('Total del período: $ 3.500.')
    expect(lineWith(message, 'Saldo pendiente')).toBe('Saldo pendiente: $ 2.500.')
  })
})

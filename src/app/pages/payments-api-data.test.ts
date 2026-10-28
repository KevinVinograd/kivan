import { describe, expect, it } from 'vitest'

import type { PaymentDto } from '@/api/payments'
import { dtoToPayment } from './payments-api-data'

/** A raw Payment entity DTO with neutral defaults; override only what a case asserts. */
function paymentDto(overrides: Partial<PaymentDto> = {}): PaymentDto {
  return {
    id: 'pay-1',
    recipientType: 'provider',
    teamMemberId: null,
    providerId: 'prov-1',
    recipientName: 'Proveedor Uno',
    period: '2026-06',
    concept: 'Servicio mensual',
    totalAmountMinor: '500000',
    paidAmountMinor: '0',
    outstandingMinor: '500000',
    currency: 'ARS',
    expectedDate: '2026-06-30',
    paymentDate: null,
    status: 'pending',
    method: null,
    treasuryAccountId: null,
    treasuryAccountName: null,
    version: 0,
    createdAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  }
}

describe('dtoToPayment', () => {
  it('converts amounts from minor to major units', () => {
    const p = dtoToPayment(paymentDto({ totalAmountMinor: '500000', paidAmountMinor: '125050' }))
    expect(p.totalAmount).toBe(5000)
    expect(p.paidAmount).toBe(1250.5)
  })

  it('keeps a known payment method and drops unknown/absent ones', () => {
    expect(dtoToPayment(paymentDto({ method: 'transfer' })).method).toBe('transfer')
    expect(dtoToPayment(paymentDto({ method: 'mercado_pago' })).method).toBe('mercado_pago')
    // Unknown backend method → undefined (front only knows a fixed set).
    expect(dtoToPayment(paymentDto({ method: 'crypto' })).method).toBeUndefined()
    expect(dtoToPayment(paymentDto({ method: null })).method).toBeUndefined()
  })

  it('maps a null paymentDate to undefined and passes a real one through', () => {
    expect(dtoToPayment(paymentDto({ paymentDate: null })).paymentDate).toBeUndefined()
    expect(dtoToPayment(paymentDto({ paymentDate: '2026-06-20' })).paymentDate).toBe('2026-06-20')
  })

  // The API serializes the column with toISOString(), so a date the operator picked
  // arrives as UTC midnight. Parsed as an instant it reads as the previous day in
  // UTC-3, which the Cashflow Posición would then compare against the anchor date.
  it('normalizes a UTC-midnight paymentDate to its calendar day', () => {
    expect(dtoToPayment(paymentDto({ paymentDate: '2026-06-20T00:00:00.000Z' })).paymentDate).toBe(
      '2026-06-20',
    )
  })

  // The mapper hardcoded 'ARS' and threw `d.currency` away, so a USD row reached the
  // table labelled as pesos and every peso sum counted its face value as centavos. The
  // ARS assertion below passed in both worlds, so the lane needs its own case.
  it('reads the lane the server sent instead of assuming pesos', () => {
    expect(dtoToPayment(paymentDto({ currency: 'USD' })).currency).toBe('USD')
    expect(dtoToPayment(paymentDto({ currency: 'ARS' })).currency).toBe('ARS')
  })

  it('passes recipient/status through and defaults the activity fields', () => {
    const p = dtoToPayment(
      paymentDto({ recipientType: 'collaborator', recipientName: 'Colab', status: 'approved' }),
    )
    expect(p.recipientType).toBe('collaborator')
    expect(p.recipientName).toBe('Colab')
    expect(p.status).toBe('approved')
    expect(p.currency).toBe('ARS')
    expect(p.lastActivityLabel).toBe('Sin actividad')
    expect(p.lastActivityAt).toBe('2026-06-01T00:00:00.000Z')
  })

  it('carries the recipient FK through, and only the one that is set', () => {
    // Without these the detail cannot reach the liquidación or the running account,
    // and `recipientName` cannot stand in — two people may share a name.
    const provider = dtoToPayment(paymentDto({ providerId: 'prov-9', teamMemberId: null }))
    expect(provider.providerId).toBe('prov-9')
    expect(provider.teamMemberId).toBeUndefined()

    const member = dtoToPayment(
      paymentDto({ recipientType: 'collaborator', teamMemberId: 'tm-3', providerId: null }),
    )
    expect(member.teamMemberId).toBe('tm-3')
    expect(member.providerId).toBeUndefined()
  })

  it('leaves both FKs absent for a recipient that has no counterparty', () => {
    // Gasto fijo / monotributo / plataforma reference nobody, which is what makes
    // the running-account and bank sections absent rather than empty.
    const p = dtoToPayment(
      paymentDto({ recipientType: 'fixed_expense', teamMemberId: null, providerId: null }),
    )
    expect(p.teamMemberId).toBeUndefined()
    expect(p.providerId).toBeUndefined()
  })
})

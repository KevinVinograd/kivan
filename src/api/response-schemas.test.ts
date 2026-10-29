import { describe, expect, it } from 'vitest'

import { ClientSchema } from './clients'
import { ReportsSummarySchema } from './reports'

function validClient(): Record<string, unknown> {
  return {
    id: 'cli-1',
    name: 'Estudio Uno',
    businessName: null,
    taxId: null,
    status: 'active',
    monthlyFeeMinor: '150000',
    currency: 'ARS',
    billingEntityId: null,
    startDate: null,
    lastIncreaseDate: null,
    clientType: null,
    services: [],
    paymentMethod: null,
    discountPercentBp: null,
    billingCycle: null,
    projectFeeMinor: null,
    projectEndDate: null,
    contactName: null,
    billingEmail: null,
    phone: null,
    address: null,
    secondaryEmail: null,
    adminContactName: null,
    adminContactEmail: null,
    adminContactPhone: null,
    createdAt: '2026-06-01T00:00:00.000Z',
  }
}

describe('ClientSchema', () => {
  it('parses a contract-valid client', () => {
    expect(ClientSchema.parse(validClient())).toMatchObject({
      id: 'cli-1',
      status: 'active',
      currency: 'ARS',
    })
  })

  it('rejects a status not in the canonical ClientStatus enum', () => {
    expect(() => ClientSchema.parse({ ...validClient(), status: 'archived' })).toThrow()
  })

  it('rejects a currency not in the canonical Currency enum', () => {
    expect(() => ClientSchema.parse({ ...validClient(), currency: 'EUR' })).toThrow()
  })

  it('rejects a missing required field', () => {
    const partial = validClient()
    delete partial.name
    expect(() => ClientSchema.parse(partial)).toThrow()
  })

  it('parses a response from an API that predates the commercial fields', () => {
    const old = validClient()
    delete old.address
    delete old.discountPercentBp
    const parsed = ClientSchema.parse(old)
    expect(parsed.address).toBeUndefined()
    expect(parsed.discountPercentBp).toBeUndefined()
  })

  it('rejects a discount rate sent as a string', () => {
    expect(() => ClientSchema.parse({ ...validClient(), discountPercentBp: '1000' })).toThrow()
  })
})

describe('ReportsSummarySchema', () => {
  const validSummary = {
    period: '2026-06',
    revenue: { billedMinor: '1', collectedMinor: '1', count: 2 },
    payouts: { totalMinor: '1', paidMinor: '1', count: 0 },
    payments: { totalMinor: '1', paidMinor: '1', count: 0 },
    netCollectedMinusPaidMinor: '0',
  }

  it('parses a valid summary (period may be null)', () => {
    expect(ReportsSummarySchema.parse(validSummary)).toMatchObject({ period: '2026-06' })
    expect(ReportsSummarySchema.parse({ ...validSummary, period: null }).period).toBeNull()
  })

  it('rejects a wrong-typed numeric field', () => {
    expect(() =>
      ReportsSummarySchema.parse({ ...validSummary, revenue: { ...validSummary.revenue, count: '2' } }),
    ).toThrow()
  })
})

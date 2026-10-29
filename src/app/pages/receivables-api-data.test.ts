import { describe, expect, it, vi } from 'vitest'

import type { ReceivableDto } from '@/api/receivables'
import {
  dtoToReceivable,
  extrasTotal,
  fetchMonthlyFeePreview,
  generateMonthlyFeesViaApi,
  updateReceivableViaApi,
} from './receivables-api-data'
import { receivablesApi } from '@/api/receivables'

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

describe('dtoToReceivable', () => {
  it('converts every money field from minor to major units', () => {
    const r = dtoToReceivable(
      receivableDto({
        baseAmountMinor: '150000',
        extraAmountMinor: '25000',
        discountAmountMinor: '5000',
        totalAmountMinor: '170000',
        collectedAmountMinor: '170000',
      }),
    )
    expect(r.baseAmount).toBe(1500)
    expect(r.extraAmount).toBe(250)
    expect(r.discountAmount).toBe(50)
    expect(r.totalAmount).toBe(1700)
    expect(r.collectedAmount).toBe(1700)
  })

  it('narrows a known emitter code to its fiscal profile', () => {
    expect(dtoToReceivable(receivableDto({ emitterCode: 'monotributo_2' })).taxProfileId).toBe(
      'monotributo_2',
    )
    expect(dtoToReceivable(receivableDto({ emitterCode: 'monotributo_2' })).emitterTaxProfile).toBe(
      'monotributo_2',
    )
  })

  it('defaults an unknown emitter code to unassigned, and null to unassigned/undefined', () => {
    expect(dtoToReceivable(receivableDto({ emitterCode: 'weird' })).taxProfileId).toBe('unassigned')
    expect(dtoToReceivable(receivableDto({ emitterCode: null })).taxProfileId).toBe('unassigned')
    expect(dtoToReceivable(receivableDto({ emitterCode: null })).emitterTaxProfile).toBeUndefined()
  })

  it('passes collection/billing status through and maps null joins to undefined', () => {
    const r = dtoToReceivable(
      receivableDto({
        status: 'collected',
        billingStatus: 'invoiced',
        businessName: 'Uno SA',
        invoiceNumber: '0001-00000042',
      }),
    )
    expect(r.status).toBe('collected')
    expect(r.billingStatus).toBe('invoiced')
    expect(r.businessName).toBe('Uno SA')
    expect(r.invoiceNumber).toBe('0001-00000042')
    expect(r.taxId).toBeUndefined()
    expect(r.cae).toBeUndefined()
    expect(r.currency).toBe('ARS')
  })

  it('normalizes a UTC-midnight collectedAt to its calendar day', () => {
    expect(dtoToReceivable(receivableDto({ collectedAt: '2026-08-18T00:00:00.000Z' })).collectedAt).toBe(
      '2026-08-18',
    )
    expect(dtoToReceivable(receivableDto({ collectedAt: null })).collectedAt).toBeUndefined()
  })
})

describe('updateReceivableViaApi', () => {
  it('sends the aggregate alongside the items, derived from them', async () => {
    const update = vi
      .spyOn(receivablesApi, 'update')
      .mockResolvedValue(receivableDto() as unknown as Awaited<ReturnType<typeof receivablesApi.update>>)

    await updateReceivableViaApi('rec-1', {
      extras: [
        { description: 'Campaña', amount: 35000, billable: true },
        { description: 'Producción', amount: 15000, billable: false },
      ],
    })

    const [, body] = update.mock.calls[0]
    expect(body.extraAmountMinor).toBe('5000000')
    expect(body.extras).toHaveLength(2)
    expect(body.service).toBeUndefined()
    expect(body.baseAmountMinor).toBeUndefined()
    update.mockRestore()
  })

  it('sums the items regardless of whether they are billable', () => {
    expect(
      extrasTotal([
        { description: 'a', amount: 1000, billable: true },
        { description: 'b', amount: 250, billable: false },
      ]),
    ).toBe(1250)
  })
})

describe('fetchMonthlyFeePreview', () => {
  it('reads the fee in pesos, not centavos', async () => {
    vi.spyOn(receivablesApi, 'monthlyFeePreview').mockResolvedValue({
      period: '2026-09-01',
      items: [
        {
          clientId: 'cli-1',
          clientName: 'Estudio Uno',
          services: ['Redes'],
          suggestedService: 'Redes',
          monthlyFeeMinor: '12000000',
          currency: 'ARS',
          skipReason: null,
          existingReceivableId: null,
        },
      ],
    })

    const { items } = await fetchMonthlyFeePreview('2026-09-01')
    const candidate = items[0]
    expect(candidate?.monthlyFee).toBe(120_000)
    expect(candidate?.skipReason).toBeNull()
  })

  it('carries the skip state through untouched, including which service could not be resolved', async () => {
    vi.spyOn(receivablesApi, 'monthlyFeePreview').mockResolvedValue({
      period: '2026-09-01',
      items: [
        {
          clientId: 'cli-2',
          clientName: 'Dos Servicios',
          services: ['Redes', 'Ads'],
          suggestedService: null,
          monthlyFeeMinor: '8000000',
          currency: 'ARS',
          skipReason: 'already_generated',
          existingReceivableId: 'rec-9',
        },
      ],
    })

    const { items } = await fetchMonthlyFeePreview('2026-09-01')
    const candidate = items[0]
    expect(candidate?.suggestedService).toBeNull()
    expect(candidate?.services).toEqual(['Redes', 'Ads'])
    expect(candidate?.skipReason).toBe('already_generated')
  })

  it('reads an API that predates manualServices as nothing billed by hand', async () => {
    vi.spyOn(receivablesApi, 'monthlyFeePreview').mockResolvedValue({
      period: '2026-09-01',
      items: [
        {
          clientId: 'cli-1',
          clientName: 'Estudio Uno',
          services: [],
          suggestedService: null,
          monthlyFeeMinor: '12000000',
          currency: 'ARS',
          skipReason: null,
          existingReceivableId: null,
        },
      ],
    })

    const { items } = await fetchMonthlyFeePreview('2026-09-01')
    expect(items[0]?.manualServices).toEqual([])
  })

  it('reads an API that predates withoutFee as nothing to disclose, not as a crash', async () => {
    vi.spyOn(receivablesApi, 'monthlyFeePreview').mockResolvedValue({
      period: '2026-09-01',
      items: [],
    })

    const preview = await fetchMonthlyFeePreview('2026-09-01')
    expect(preview.withoutFee).toEqual([])
  })

  it('carries the excluded active clients through by name', async () => {
    vi.spyOn(receivablesApi, 'monthlyFeePreview').mockResolvedValue({
      period: '2026-09-01',
      items: [],
      withoutFee: ['Sin Abono', 'Solo Proyecto'],
    })

    const preview = await fetchMonthlyFeePreview('2026-09-01')
    expect(preview.withoutFee).toEqual(['Sin Abono', 'Solo Proyecto'])
  })
})

describe('generateMonthlyFeesViaApi', () => {
  it('sends who to bill and under which service, and never an amount', async () => {
    const post = vi.spyOn(receivablesApi, 'generateMonthlyFees').mockResolvedValue({
      period: '2026-09-01',
      created: [receivableDto({ id: 'rec-new', source: 'monthly_fee' })],
      skipped: [{ clientId: 'cli-2', clientName: 'Dos Servicios', reason: 'manual_exists' }],
    })

    const result = await generateMonthlyFeesViaApi({
      period: '2026-09-01',
      dueDate: '2026-09-10',
      items: [{ clientId: 'cli-1', service: 'Redes' }],
    })

    expect(JSON.stringify(post.mock.calls[0])).not.toMatch(/Minor|amount/i)
    expect(result.created).toHaveLength(1)
    expect(result.created[0]?.totalAmount).toBe(1500)
    expect(result.skipped).toEqual([
      { clientId: 'cli-2', clientName: 'Dos Servicios', reason: 'manual_exists' },
    ])
  })
})

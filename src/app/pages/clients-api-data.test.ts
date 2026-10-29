import { describe, expect, it } from 'vitest'

import type { ClientDto } from '@/api/clients'
import { dtoToClient, toClientPayload } from './clients-api-data'
import type { ClientFormValues } from './clients-dialogs'

function clientDto(overrides: Partial<ClientDto> = {}): ClientDto {
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
    ...overrides,
  }
}

describe('dtoToClient', () => {
  it('converts the fee from minor units (centavos) to major units (pesos)', () => {
    const c = dtoToClient(clientDto({ monthlyFeeMinor: '150000' }))
    expect(c.monthlyFee).toBe(1500)
    expect(c.currentMonthDueAmount).toBeUndefined()
  })

  it('maps null optional fields to undefined (not null)', () => {
    const c = dtoToClient(clientDto())
    expect(c.businessName).toBeUndefined()
    expect(c.taxId).toBeUndefined()
    expect(c.contactName).toBeUndefined()
    expect(c.billingEmail).toBeUndefined()
    expect(c.phone).toBeUndefined()
    expect(c.startDate).toBeUndefined()
    expect(c.lastIncreaseDate).toBeUndefined()
  })

  it('passes through populated entity fields', () => {
    const c = dtoToClient(
      clientDto({
        businessName: 'Estudio Uno SA',
        taxId: '30-11111111-1',
        contactName: 'Ana',
        billingEmail: 'ana@uno.com',
        phone: '+54 11 5555',
        startDate: '2025-01-15',
        lastIncreaseDate: '2026-03-01',
      }),
    )
    expect(c.businessName).toBe('Estudio Uno SA')
    expect(c.taxId).toBe('30-11111111-1')
    expect(c.contactName).toBe('Ana')
    expect(c.billingEmail).toBe('ana@uno.com')
    expect(c.phone).toBe('+54 11 5555')
    expect(c.startDate).toBe('2025-01-15')
    expect(c.lastIncreaseDate).toBe('2026-03-01')
  })

  it('leaves the month money absent — the client entity does not carry it', () => {
    const c = dtoToClient(clientDto())
    expect(c.assignedTeam).toEqual([])
    expect(c.paymentStatus).toBeUndefined()
    expect(c.invoiceStatus).toBeUndefined()
    expect(c.currentMonthDueAmount).toBeUndefined()
    expect(c.currentMonthPaidAmount).toBeUndefined()
  })

  it('reads the contracted services from the DTO', () => {
    const c = dtoToClient(clientDto({ services: ['Redes', 'Diseño gráfico'] }))
    expect(c.services).toEqual(['Redes', 'Diseño gráfico'])
  })

  it('carries the commercial terms through, converting the project fee from centavos', () => {
    const c = dtoToClient(
      clientDto({
        clientType: 'Gastronomía',
        paymentMethod: 'transfer',
        billingCycle: 'arrears',
        projectFeeMinor: '5000000',
        projectEndDate: '2026-12-31',
        secondaryEmail: 'pagos@uno.com',
        adminContactName: 'Vero',
      }),
    )
    expect(c.clientType).toBe('Gastronomía')
    expect(c.paymentMethod).toBe('transfer')
    expect(c.billingCycle).toBe('arrears')
    expect(c.projectFee).toBe(50000)
    expect(c.projectEndDate).toBe('2026-12-31')
    expect(c.secondaryEmail).toBe('pagos@uno.com')
    expect(c.adminContactName).toBe('Vero')
  })

  it('reads the currency lane from the DTO instead of assuming pesos', () => {
    expect(dtoToClient(clientDto({ currency: 'USD' })).currency).toBe('USD')
    expect(dtoToClient(clientDto()).currency).toBe('ARS')
  })

  it('reads the emisor from the DTO instead of assuming the first monotributo', () => {
    expect(dtoToClient(clientDto({ billingEntityId: 'monotributo_2' })).billingEntity).toBe(
      'monotributo_2',
    )
    expect(dtoToClient(clientDto({ billingEntityId: 'monotributo_3' })).billingEntity).toBe(
      'monotributo_3',
    )
  })

  it('leaves the emisor unset rather than inventing one', () => {
    expect(dtoToClient(clientDto({ billingEntityId: null })).billingEntity).toBeUndefined()
    expect(dtoToClient(clientDto({ billingEntityId: 'monotributo_9' })).billingEntity).toBeUndefined()
  })

  it('mirrors updatedAt onto createdAt (no separate updatedAt on the DTO)', () => {
    const c = dtoToClient(clientDto({ createdAt: '2026-06-10T12:00:00.000Z' }))
    expect(c.createdAt).toBe('2026-06-10T12:00:00.000Z')
    expect(c.updatedAt).toBe('2026-06-10T12:00:00.000Z')
  })
})

describe('toClientPayload', () => {
  function form(overrides: Partial<ClientFormValues> = {}): ClientFormValues {
    return {
      name: 'Estudio Uno',
      businessName: '',
      taxId: '',
      clientType: '',
      status: 'active',
      monthlyFee: 1500,
      currency: 'ARS',
      billingEntity: '',
      services: [],
      contactName: '',
      billingEmail: '',
      phone: '',
      address: '',
      secondaryEmail: '',
      adminContactName: '',
      adminContactEmail: '',
      adminContactPhone: '',
      paymentMethod: '',
      discountPercent: 0,
      billingCycle: '',
      projectFee: 0,
      projectEndDate: '',
      startDate: '',
      ...overrides,
    }
  }

  it('sends an emptied domicilio and discount as null, so clearing them clears them', () => {
    const payload = toClientPayload(form({ address: '', discountPercent: 0 }))
    expect(payload.address).toBeNull()
    expect(payload.discountPercentBp).toBeNull()
    expect('phone' in payload).toBe(false)
    expect('adminContactName' in payload).toBe(false)
  })

  it('converts the agreed percent to basis points', () => {
    expect(toClientPayload(form({ discountPercent: 10 })).discountPercentBp).toBe(1000)
    expect(toClientPayload(form({ discountPercent: 12.5 })).discountPercentBp).toBe(1250)
  })

  it('round-trips a domicilio', () => {
    expect(toClientPayload(form({ address: 'Av. Corrientes 1234' })).address).toBe(
      'Av. Corrientes 1234',
    )
  })
})

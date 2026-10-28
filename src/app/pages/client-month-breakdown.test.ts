import { describe, expect, it } from 'vitest'

import type { ClientServiceDto } from '@/api/clients'
import type { Client } from './clients-mock-data'
import type { ClientMonthFigures } from './client-month-data'
import { clientProfitBreakdown, contractedFeeOf, monthCostDetail } from './client-month-breakdown'
import { formatCompactCurrency as money } from './clients-format'

/** Only the fields the breakdown reads; the rest of a client is irrelevant to it. */
function client(over: Partial<Client>): Client {
  return { currency: 'ARS', monthlyFee: 0, services: [], ...over } as Client
}

function month(over: Partial<ClientMonthFigures>): ClientMonthFigures {
  return { billed: 0, team: 0, production: 0, viatics: 0, other: 0, total: 0, ...over }
}

const values = (rows: { value: string; hint?: string }[]) => rows.map((r) => [r.value, r.hint ?? null])

describe('clientProfitBreakdown', () => {
  it('states the real margin once the month is billed in pesos', () => {
    const rows = clientProfitBreakdown(
      client({ currentMonthDueAmount: 1_700_000 }),
      month({ billed: 1_700_000, team: 900_000, production: 300_000, total: 1_200_000 }),
      1_700_000,
    )
    expect(values(rows)).toEqual([
      [money(1_700_000), null],
      [money(1_200_000), null],
      [money(500_000), null],
    ])
  })

  it('shows a new client its contracted fee and its cost before any cobro (CUK)', () => {
    const rows = clientProfitBreakdown(
      client({ monthlyFee: 0 }),
      month({ team: 900_000, production: 300_000, total: 1_200_000 }),
      1_700_000,
    )
    expect(values(rows)).toEqual([
      [money(1_700_000), 'Contratado, sin cobro este mes'],
      [money(1_200_000), null],
      [money(500_000), 'Estimada'],
    ])
  })

  it('never subtracts a peso cost from a dollar fee', () => {
    const rows = clientProfitBreakdown(client({ currency: 'USD' }), month({ total: 100_000 }), 1_260)
    expect(rows[0].hint).toBe('Contratado, sin cobro este mes')
    expect(rows[2].value).toBe('No disponible')
  })

  it('says nothing about cost while the month is not known', () => {
    const rows = clientProfitBreakdown(client({ currentMonthDueAmount: 500_000 }), undefined, 500_000)
    expect(rows.map((r) => r.value).slice(1)).toEqual(['No disponible', 'No disponible'])
  })
})

describe('contractedFeeOf', () => {
  const line = (over: Partial<ClientServiceDto>) =>
    ({ active: true, billingMode: 'monthly', priceMinor: '0', ...over }) as ClientServiceDto

  it('is the sum of the monthly lines, ignoring hourly prices', () => {
    const lines = [
      line({ priceMinor: '130000000' }),
      line({ priceMinor: '95000000' }),
      line({ billingMode: 'per_hour', priceMinor: '7500000' }),
    ]
    expect(contractedFeeOf(client({ monthlyFee: 99 }), lines)).toBe(2_250_000)
  })

  it('falls back to the hand-typed abono without monthly lines', () => {
    expect(contractedFeeOf(client({ monthlyFee: 850_000 }), [])).toBe(850_000)
    expect(contractedFeeOf(client({ monthlyFee: 850_000 }), undefined)).toBe(850_000)
  })
})

describe('monthCostDetail', () => {
  it('names what the cost is made of, and only what is there', () => {
    expect(monthCostDetail(month({ team: 900_000, production: 300_000, viatics: 40_000 }))).toBe(
      `Costo del mes: equipo fijo ${money(900_000)} · producciones ${money(300_000)} · viáticos ${money(40_000)}`,
    )
    expect(monthCostDetail(month({ team: null, production: null }))).toBeNull()
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ProductionInput } from './monthly-operation-data'

const createProduction = vi.fn()
vi.mock('@/api/monthly', () => ({ monthlyApi: { createProduction: (...args: unknown[]) => createProduction(...args) } }))
vi.mock('./team-payout-api-data', () => ({ productionsToEntries: (dtos: unknown[]) => dtos }))

const { addMemberProductionViaApi } = await import('./team-api-data')

/** A production as the planilla form submits it; override only what a case asserts. */
function input(overrides: Partial<ProductionInput> = {}): ProductionInput {
  return {
    date: '2026-09-18',
    clientId: 'c-1',
    clientName: 'Inmobiliaria Sur',
    title: 'Produ mensual',
    type: 'Producción mensual',
    responsible: '',
    participants: [],
    hours: 2.5,
    viatics: 14929.51,
    totalCost: 0,
    billAmount: 0,
    billable: null,
    notes: '',
    clientServiceId: null,
    accountManagerId: 'tm-am',
    creatorId: 'tm-creator',
    costEdited: false,
    viaticsPaidAt: '',
    receipt: '',
    ...overrides,
  }
}

describe('addMemberProductionViaApi', () => {
  beforeEach(() => {
    createProduction.mockReset()
    createProduction.mockResolvedValue({ id: 'p-1' })
  })

  it('returns no entry when nobody worked the production, instead of an undefined one', async () => {
    createProduction.mockResolvedValue({ id: 'p-1', attribution: [] })
    const realMapper = await vi.importActual<typeof import('./team-payout-api-data')>('./team-payout-api-data')
    // The real mapper, so the empty attribution goes through the code Equipo reads.
    expect(realMapper.productionsToEntries([{ id: 'p-1', attribution: [] } as never])).toEqual([])
    await expect(addMemberProductionViaApi(input({ creatorId: '' }))).resolves.toEqual([{ id: 'p-1', attribution: [] }])
  })

  it('writes into the month of the production date, not the current one', async () => {
    await addMemberProductionViaApi(input({ date: '2026-08-30' }))
    expect(createProduction.mock.calls[0]?.[0]).toBe('2026-08')
  })

  it('sends the planilla body: creator as the attribution, account manager, viáticos', async () => {
    await addMemberProductionViaApi(input())
    const body = createProduction.mock.calls[0]?.[1]
    expect(body).toMatchObject({
      title: 'Produ mensual',
      type: 'Producción mensual',
      hours: 2.5,
      accountManagerId: 'tm-am',
      viaticsMinor: '1492951',
      attribution: [{ teamMemberId: 'tm-creator', hours: 2.5, role: 'responsible' }],
      notes: '',
    })
  })

  it('leaves the cost to the server unless it was typed', async () => {
    await addMemberProductionViaApi(input())
    expect(createProduction.mock.calls[0]?.[1]).not.toHaveProperty('totalCostMinor')
    await addMemberProductionViaApi(input({ costEdited: true, totalCost: 30000 }))
    expect(createProduction.mock.calls[1]?.[1]).toMatchObject({ totalCostMinor: '3000000' })
  })
})

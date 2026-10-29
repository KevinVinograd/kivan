import { describe, expect, it, vi } from 'vitest'

import type { ClientAssignmentDto } from '@/api/clients'
import { dtoToAssignment } from './assignments-api-data'

function dto(overrides: Partial<ClientAssignmentDto> = {}): ClientAssignmentDto {
  return {
    id: 'as-1',
    clientId: 'cli-1',
    teamMemberId: 'tm-1',
    serviceId: null,
    roleOnClient: 'Community',
    status: 'active',
    allocationPercent: null,
    estimatedMonthlyHours: null,
    monthlyCostMinor: null,
    assignedSince: null,
    endedAt: null,
    clientName: 'Estudio Uno',
    teamMemberName: 'Vir',
    serviceName: null,
    ...overrides,
  }
}

describe('dtoToAssignment — per-client cost', () => {
  it('converts the amount from minor units to major', () => {
    expect(dtoToAssignment(dto({ monthlyCostMinor: '25000' })).monthlyCost).toBe(250)
  })

  it('keeps an agreed ZERO as zero, not as absence', () => {
    const mapped = dtoToAssignment(dto({ monthlyCostMinor: '0' }))
    expect(mapped.monthlyCost).toBe(0)
    expect('monthlyCost' in mapped).toBe(true)
  })

  it('leaves the field absent when the server sent null', () => {
    const mapped = dtoToAssignment(dto({ monthlyCostMinor: null }))
    expect(mapped.monthlyCost).toBeUndefined()
    expect('monthlyCost' in mapped).toBe(false)
  })

  it('leaves the field absent on an API that predates it', () => {
    const { monthlyCostMinor: _omitted, ...withoutField } = dto()
    const mapped = dtoToAssignment(withoutField as ClientAssignmentDto)
    expect(mapped.monthlyCost).toBeUndefined()
  })
})

describe('assignViaApi — per-client cost on the way out', () => {
  async function capture(input: Parameters<typeof import('./assignments-api-data').assignViaApi>[2]) {
    const body = vi.fn()
    vi.doMock('@/api/clients', async (importOriginal) => {
      const actual = await importOriginal<typeof import('@/api/clients')>()
      return {
        ...actual,
        clientsApi: {
          ...actual.clientsApi,
          createAssignment: (_clientId: string, sent: unknown) => {
            body(sent)
            return Promise.resolve(dto())
          },
        },
      }
    })
    vi.resetModules()
    const { assignViaApi } = await import('./assignments-api-data')
    await assignViaApi('cli-1', 'tm-1', input)
    vi.doUnmock('@/api/clients')
    return body.mock.calls[0]![0] as Record<string, unknown>
  }

  it('sends an agreed ZERO', async () => {
    const sent = await capture({ roleOnClient: 'x', monthlyCost: 0 })
    expect(sent.monthlyCostMinor).toBe('0')
  })

  it('omits the key entirely when no amount was entered', async () => {
    const sent = await capture({ roleOnClient: 'x' })
    expect('monthlyCostMinor' in sent).toBe(false)
  })

  it('converts pesos to minor units', async () => {
    const sent = await capture({ roleOnClient: 'x', monthlyCost: 1500.5 })
    expect(sent.monthlyCostMinor).toBe('150050')
  })
})

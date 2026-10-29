import { describe, expect, it } from 'vitest'

import type { TeamMemberDto } from '@/api/team'
import { dtoToTeamMember, formToTeamInput } from './team-api-data'
import { bankBadge } from './team-format'
import type { TeamMemberFormValues } from './team-data'

function memberDto(overrides: Partial<TeamMemberDto> = {}): TeamMemberDto {
  return {
    id: 'tm-1',
    name: 'Micaela Duarte',
    role: 'Contadora',
    status: 'active',
    employmentType: 'full_time',
    compensationModel: 'monthly_fixed',
    currency: 'ARS',
    hourlyRateMinor: null,
    monthlyAmountMinor: '80000000',
    productionRateMinor: null,
    taxId: null,
    email: null,
    phone: null,
    notes: null,
    startDate: null,
    bankComplete: false,
    bankStatus: 'none',
    createdAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  }
}

function formValues(overrides: Partial<TeamMemberFormValues> = {}): TeamMemberFormValues {
  return {
    firstName: 'Micaela',
    lastName: 'Duarte',
    role: 'Contadora',
    employmentType: 'full_time',
    paymentModel: 'monthly_fixed',
    hourlyRate: 0,
    monthlyAmount: 800000,
    productionRate: 0,
    taxId: '',
    email: '',
    phone: '',
    notes: '',
    ...overrides,
  } as TeamMemberFormValues
}

describe('dtoToTeamMember', () => {
  it('splits the name into first/last on a best-effort basis', () => {
    expect(dtoToTeamMember(memberDto({ name: 'Micaela Duarte' }))).toMatchObject({
      firstName: 'Micaela',
      lastName: 'Duarte',
    })
    expect(dtoToTeamMember(memberDto({ name: 'Ana Paula Gómez' }))).toMatchObject({
      firstName: 'Ana',
      lastName: 'Paula Gómez',
    })
    const solo = dtoToTeamMember(memberDto({ name: 'Cher' }))
    expect(solo.firstName).toBe('Cher')
    expect(solo.lastName).toBeUndefined()
  })

  it('converts rates from minor units and maps null rates to undefined', () => {
    const m = dtoToTeamMember(
      memberDto({ hourlyRateMinor: '500000', monthlyAmountMinor: null, productionRateMinor: '12345' }),
    )
    expect(m.compensation.hourlyRate).toBe(5000)
    expect(m.compensation.monthlyAmount).toBeUndefined()
    expect(m.compensation.productionRate).toBe(123.45)
    expect(m.compensation.currency).toBe('ARS')
  })

  it('falls back to safe enums for unknown status/employment/compensation', () => {
    const m = dtoToTeamMember(
      memberDto({ status: 'zzz', employmentType: 'zzz', compensationModel: 'zzz' }),
    )
    expect(m.status).toBe('active')
    expect(m.employmentType).toBe('freelance')
    expect(m.compensation.model).toBe('monthly_fixed')
  })

  it('maps null contact fields to undefined', () => {
    const m = dtoToTeamMember(memberDto())
    expect(m.email).toBeUndefined()
    expect(m.phone).toBeUndefined()
    expect(m.taxId).toBeUndefined()
    expect(m.notes).toBeUndefined()
    expect(m.startDate).toBeUndefined()
  })

  it('drives the Datos bancarios badge from the derived bank status', () => {
    const complete = dtoToTeamMember(memberDto({ bankComplete: true, bankStatus: 'complete' }))
    expect(complete.bank).toBeUndefined()
    expect(bankBadge(complete).label).toBe('Completo')
    const partial = dtoToTeamMember(memberDto({ bankStatus: 'incomplete' }))
    expect(bankBadge(partial).label).toBe('Incompleto')
    expect(bankBadge(dtoToTeamMember(memberDto())).label).toBe('Sin datos')
  })
})

describe('formToTeamInput', () => {
  it('combines the name and falls back when role/name are blank', () => {
    expect(formToTeamInput(formValues({ firstName: 'Ana', lastName: 'Paz' })).name).toBe('Ana Paz')
    expect(formToTeamInput(formValues({ firstName: '', lastName: '', role: '' }))).toMatchObject({
      name: 'Sin nombre',
      role: 'Sin rol',
    })
  })

  it('on CREATE omits zero optional rates (unset = null)', () => {
    const body = formToTeamInput(
      formValues({ hourlyRate: 0, monthlyAmount: 800000, productionRate: 0 }),
      'create',
    )
    expect(body.monthlyAmountMinor).toBe('80000000')
    expect(body).not.toHaveProperty('hourlyRateMinor')
    expect(body).not.toHaveProperty('productionRateMinor')
  })

  it('on UPDATE always sends the three rates (0 → "0") so a rate can be zeroed', () => {
    const body = formToTeamInput(
      formValues({ hourlyRate: 0, monthlyAmount: 0, productionRate: 0 }),
      'update',
    )
    expect(body.hourlyRateMinor).toBe('0')
    expect(body.monthlyAmountMinor).toBe('0')
    expect(body.productionRateMinor).toBe('0')
  })

  it('trims and omits blank contact fields', () => {
    const body = formToTeamInput(formValues({ email: '  a@b.com ', phone: '   ', taxId: '20-1-3' }))
    expect(body.email).toBe('a@b.com')
    expect(body.taxId).toBe('20-1-3')
    expect(body).not.toHaveProperty('phone')
  })
})

import type { Currency } from '@hold/shared'

import {
  teamApi,
  type CreateTeamMemberInput,
  type TeamMemberDto,
} from '@/api/team'
import { timeEntriesApi, type TimeEntryDto } from '@/api/time-entries'
import {
  memberActivityApi,
  type MemberExpenseDto,
  type MemberExtraDto,
} from '@/api/member-activity'
import { monthlyApi } from '@/api/monthly'
import { productionsToEntries } from './team-payout-api-data'
import { toMajor, toMinor } from '@/lib/money'
import type {
  BankDetails,
  CompensationModel,
  EmploymentType,
  ExpenseEntry,
  ExpenseStatus,
  ExtraStatus,
  ExtraWorkEntry,
  ProductionEntry,
  TeamMember,
  TeamMemberStatus,
  TimeEntry,
} from './team-mock-data'
import type {
  ExpenseInput,
  ExtraInput,
  TeamMemberFormValues,
  TimeEntryInput,
} from './team-data'
import type { ProductionInput } from './monthly-operation-data'
import { productionPayload } from './production-payload'

const STATUSES: readonly string[] = ['active', 'paused', 'inactive']
const EMPLOYMENT_TYPES: readonly string[] = ['full_time', 'part_time', 'freelance', 'external']
const COMPENSATION_MODELS: readonly string[] = ['hourly', 'monthly_fixed', 'per_production', 'mixed']

const minorToMajor = (minor: string | null): number | undefined =>
  minor === null ? undefined : Number(minor) / 100
const majorToMinor = (major: number): string => String(Math.round(major * 100))

function asStatus(value: string): TeamMemberStatus {
  return STATUSES.includes(value) ? (value as TeamMemberStatus) : 'active'
}
function asEmploymentType(value: string): EmploymentType {
  return EMPLOYMENT_TYPES.includes(value) ? (value as EmploymentType) : 'freelance'
}
function asCompensationModel(value: string): CompensationModel {
  return COMPENSATION_MODELS.includes(value) ? (value as CompensationModel) : 'monthly_fixed'
}

export function dtoToTeamMember(d: TeamMemberDto): TeamMember {
  const parts = d.name.trim().split(/\s+/)
  const firstName = parts[0] || undefined
  const lastName = parts.length > 1 ? parts.slice(1).join(' ') : undefined
  return {
    id: d.id,
    name: d.name,
    firstName,
    lastName,
    role: d.role,
    status: asStatus(d.status),
    employmentType: asEmploymentType(d.employmentType),
    startDate: d.startDate ?? undefined,
    compensation: {
      model: asCompensationModel(d.compensationModel),
      hourlyRate: minorToMajor(d.hourlyRateMinor),
      monthlyAmount: minorToMajor(d.monthlyAmountMinor),
      productionRate: minorToMajor(d.productionRateMinor),
      currency: d.currency as Currency,
    },
    email: d.email ?? undefined,
    phone: d.phone ?? undefined,
    taxId: d.taxId ?? undefined,
    notes: d.notes ?? undefined,
    bankComplete: d.bankComplete,
    bankStatus: d.bankStatus,
  }
}

export function formToTeamInput(
  values: TeamMemberFormValues,
  mode: 'create' | 'update' = 'create',
): CreateTeamMemberInput {
  const name = `${values.firstName} ${values.lastName}`.trim() || values.firstName || 'Sin nombre'
  const rates =
    mode === 'update'
      ? {
          hourlyRateMinor: majorToMinor(values.hourlyRate || 0),
          monthlyAmountMinor: majorToMinor(values.monthlyAmount || 0),
          productionRateMinor: majorToMinor(values.productionRate || 0),
        }
      : {
          ...(values.hourlyRate ? { hourlyRateMinor: majorToMinor(values.hourlyRate) } : {}),
          ...(values.monthlyAmount ? { monthlyAmountMinor: majorToMinor(values.monthlyAmount) } : {}),
          ...(values.productionRate ? { productionRateMinor: majorToMinor(values.productionRate) } : {}),
        }
  return {
    name,
    role: values.role.trim() || 'Sin rol',
    status: values.status,
    employmentType: values.employmentType,
    compensationModel: values.paymentModel,
    ...rates,
    ...(values.taxId.trim() ? { taxId: values.taxId.trim() } : {}),
    ...(values.email.trim() ? { email: values.email.trim() } : {}),
    ...(values.phone.trim() ? { phone: values.phone.trim() } : {}),
    ...(values.notes.trim() ? { notes: values.notes.trim() } : {}),
  }
}

export async function fetchTeamMembers(): Promise<TeamMember[]> {
  const LIMIT = 100
  const all: TeamMemberDto[] = []
  for (let offset = 0; ; offset += LIMIT) {
    const res = await teamApi.list({ limit: LIMIT, offset })
    all.push(...res.items)
    if (all.length >= res.total || res.items.length < LIMIT) break
  }
  return all.map(dtoToTeamMember)
}

export async function createTeamMemberViaApi(values: TeamMemberFormValues): Promise<TeamMember> {
  return dtoToTeamMember(await teamApi.create(formToTeamInput(values)))
}

export async function updateTeamMemberViaApi(
  id: string,
  values: TeamMemberFormValues,
): Promise<TeamMember> {
  return dtoToTeamMember(await teamApi.update(id, formToTeamInput(values, 'update')))
}

export async function setTeamMemberStatusViaApi(
  id: string,
  status: TeamMember['status'],
): Promise<TeamMember> {
  return dtoToTeamMember(await teamApi.update(id, { status }))
}

export async function deactivateTeamMemberViaApi(id: string): Promise<void> {
  await teamApi.deactivate(id)
}

export async function fetchMemberBank(id: string): Promise<BankDetails | null> {
  const dto = await teamApi.getBank(id)
  if (!dto) return null
  return {
    bankName: dto.bankName ?? undefined,
    accountHolder: dto.accountHolder ?? undefined,
    cbuOrCvu: dto.cbuOrCvu ?? undefined,
    alias: dto.alias ?? undefined,
  }
}

export async function saveMemberBankViaApi(
  id: string,
  values: TeamMemberFormValues,
): Promise<void> {
  await teamApi.updateBank(id, {
    bankName: values.bankName.trim(),
    accountHolder: values.accountHolder.trim(),
    cbuOrCvu: values.cbuOrCvu.trim(),
    bankAlias: values.bankAlias.trim(),
  })
}

function dtoToTimeEntry(d: TimeEntryDto): TimeEntry {
  return {
    id: d.id,
    teamMemberId: d.teamMemberId,
    clientId: d.clientId ?? '',
    clientName: d.clientName ?? '',
    taskType: d.taskType,
    date: d.date,
    month: d.month,
    hours: d.hours,
    description: d.description ?? undefined,
    isOutOfScope: d.isOutOfScope,
  }
}

export async function fetchTimeEntries(period?: string): Promise<TimeEntry[]> {
  const rows = await timeEntriesApi.list(period ? { period } : undefined)
  return rows.map(dtoToTimeEntry)
}

export async function addTimeEntryViaApi(
  memberId: string,
  input: TimeEntryInput,
): Promise<TimeEntry> {
  const dto = await timeEntriesApi.create(memberId, {
    clientId: input.clientId || undefined,
    clientName: input.clientName || undefined,
    taskType: input.taskType,
    date: input.date,
    hours: input.hours,
    description: input.description || undefined,
    isOutOfScope: input.isOutOfScope,
  })
  return dtoToTimeEntry(dto)
}

function dtoToExpense(d: MemberExpenseDto): ExpenseEntry {
  return {
    id: d.id,
    teamMemberId: d.teamMemberId,
    clientId: d.clientId ?? undefined,
    clientName: d.clientName ?? undefined,
    date: d.date,
    concept: d.concept,
    amount: toMajor(d.amountMinor),
    status: d.status as ExpenseStatus,
    notes: d.notes ?? undefined,
  }
}

function dtoToExtra(d: MemberExtraDto): ExtraWorkEntry {
  return {
    id: d.id,
    teamMemberId: d.teamMemberId,
    clientId: d.clientId ?? '',
    clientName: d.clientName ?? '',
    date: d.date,
    description: d.description,
    hours: d.hours ?? undefined,
    amount: toMajor(d.amountMinor),
    status: d.status as ExtraStatus,
  }
}

export async function fetchMemberExpenses(teamMemberId?: string): Promise<ExpenseEntry[]> {
  return (await memberActivityApi.listExpenses(teamMemberId)).map(dtoToExpense)
}

export async function fetchMemberExtras(teamMemberId?: string): Promise<ExtraWorkEntry[]> {
  return (await memberActivityApi.listExtras(teamMemberId)).map(dtoToExtra)
}

export async function addMemberExpenseViaApi(
  memberId: string,
  input: ExpenseInput,
): Promise<ExpenseEntry> {
  const dto = await memberActivityApi.createExpense({
    teamMemberId: memberId,
    clientId: input.clientId || undefined,
    clientName: input.clientName || undefined,
    date: input.date,
    concept: input.concept,
    amountMinor: toMinor(input.amount),
  })
  return dtoToExpense(dto)
}

export async function addMemberExtraViaApi(
  memberId: string,
  input: ExtraInput,
): Promise<ExtraWorkEntry> {
  const dto = await memberActivityApi.createExtra({
    teamMemberId: memberId,
    clientId: input.clientId || undefined,
    clientName: input.clientName || undefined,
    date: input.date,
    description: input.description,
    hours: input.hours || undefined,
    amountMinor: toMinor(input.amount),
  })
  return dtoToExtra(dto)
}

export async function approveMemberExtrasViaApi(memberId: string): Promise<number> {
  const { approved } = await memberActivityApi.approveExtras(memberId)
  return approved
}

export async function addMemberProductionViaApi(input: ProductionInput): Promise<ProductionEntry[]> {
  const dto = await monthlyApi.createProduction(input.date.slice(0, 7), productionPayload(input))
  return productionsToEntries([dto])
}

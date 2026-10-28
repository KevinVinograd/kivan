/**
 * Bridges the real TeamMember (roster) API to the front's `TeamMember` shape.
 * The API returns a FLAT entity with money in minor units; the front nests a
 * `compensation` object in major units (pesos) and carries a few fields the
 * backend can't persist yet (bank details, firstName/lastName split, avatarUrl).
 *
 * NOTE: bank details are NOT part of this flat DTO. They are third-party PII served on
 * their own capability-gated sub-resource (`fetchMemberBank` / `saveMemberBankViaApi`,
 * behind requireCapability('teamBankDetails')) so `teamBankDetails` closes read+write in
 * one line — never inline on the member, which would leak them to any reader.
 */
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

/** Money crosses the wire in minor units (cents); the front holds pesos. */

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

/** Map the raw API entity onto the front TeamMember. `name` is split into
 *  first/last on a best-effort basis so the edit form can prefill; bank details
 *  have no backend source and stay undefined. */
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
      // Read, not assumed. The DTO carries it.
      currency: d.currency as Currency,
    },
    email: d.email ?? undefined,
    phone: d.phone ?? undefined,
    taxId: d.taxId ?? undefined,
    notes: d.notes ?? undefined,
    // Bank FIELDS are gated (absent here); this derived flag drives the pay-readiness signal.
    bankComplete: d.bankComplete,
    bankStatus: d.bankStatus,
  }
}

/** Map the flat dialog form onto the create/update body. Combines the name and
 *  converts rates to minor units; bank details have no backend home and are omitted.
 *
 *  On CREATE, empty/zero optional fields are omitted (unset = null). On UPDATE the
 *  three rate fields are ALWAYS sent (0 → "0") so a rate can be zeroed and a stale
 *  rate never lingers after a compensation-model switch (a partial update omitting a
 *  field means "leave unchanged", not "clear"). */
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
    // Persist the roster status so Editar persona / En pausa survive a reload.
    status: values.status,
    employmentType: values.employmentType,
    compensationModel: values.paymentModel,
    // NOT sent. This form has no currency field, so sending one could only ever send a
    // guess: it wrote 'ARS' on every save, which RESET the lane of a member paid in
    // another one. Omitted, a create takes the server default and an edit leaves the
    // stored value alone.
    ...rates,
    ...(values.taxId.trim() ? { taxId: values.taxId.trim() } : {}),
    ...(values.email.trim() ? { email: values.email.trim() } : {}),
    ...(values.phone.trim() ? { phone: values.phone.trim() } : {}),
    ...(values.notes.trim() ? { notes: values.notes.trim() } : {}),
  }
}

/** Load the workspace's team roster from the API, mapped to the front shape.
 *  The list endpoint caps `limit` at 100, so page through until exhausted. */
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

/** Persist a new member and return it in the front shape. */
export async function createTeamMemberViaApi(values: TeamMemberFormValues): Promise<TeamMember> {
  return dtoToTeamMember(await teamApi.create(formToTeamInput(values)))
}

/** Persist an edit to a member and return the updated front shape. */
export async function updateTeamMemberViaApi(
  id: string,
  values: TeamMemberFormValues,
): Promise<TeamMember> {
  return dtoToTeamMember(await teamApi.update(id, formToTeamInput(values, 'update')))
}

/** Set ONLY a member's roster status (active/paused) — the lightweight write behind the
 *  bulk "Cambiar estado". Deactivation ('inactive') goes through the soft-delete endpoint. */
export async function setTeamMemberStatusViaApi(
  id: string,
  status: TeamMember['status'],
): Promise<TeamMember> {
  return dtoToTeamMember(await teamApi.update(id, { status }))
}

/** Deactivate (soft-delete) a member; the API removes it from the roster list. */
export async function deactivateTeamMemberViaApi(id: string): Promise<void> {
  await teamApi.deactivate(id)
}

/**
 * A member's bank details, from the capability-gated sub-resource. Only call this when the
 * signed-in role holds `teamBankDetails` (else the API 403s). Null when none is on file.
 */
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

/** Upsert a member's bank details (capability-gated). '' clears a field; upserts the Bank row. */
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

// ── Time entries (Cargar horas) ──────────────────────────────────────────────
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

/** All logged hours for a period (workspace-wide; the API scopes an employee to their own). */
export async function fetchTimeEntries(period?: string): Promise<TimeEntry[]> {
  const rows = await timeEntriesApi.list(period ? { period } : undefined)
  return rows.map(dtoToTimeEntry)
}

/** Persist one logged-hours entry and return it in the front shape. */
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

// ── Member activity: viáticos + extra work ───────────────────────────────────

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

/** All viáticos (workspace-wide; the API scopes an employee to their own). */
export async function fetchMemberExpenses(teamMemberId?: string): Promise<ExpenseEntry[]> {
  return (await memberActivityApi.listExpenses(teamMemberId)).map(dtoToExpense)
}

/** All extra work (workspace-wide; the API scopes an employee to their own). */
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

/** Approve every pending extra for a member. Returns rows approved. */
export async function approveMemberExtrasViaApi(memberId: string): Promise<number> {
  const { approved } = await memberActivityApi.approveExtras(memberId)
  return approved
}

/**
 * Persist a production loaded from a person or a client. It is the SAME entity the monthly
 * operation owns (`POST /months/:period/productions`), sent with the SAME body
 * (`productionPayload`), so the team surface has neither a parallel store nor a parallel
 * shape. The month comes from the production's own date, so loading into a past month lands
 * there.
 */
export async function addMemberProductionViaApi(input: ProductionInput): Promise<ProductionEntry[]> {
  const dto = await monthlyApi.createProduction(input.date.slice(0, 7), productionPayload(input))
  // One entry per person who worked it, and NONE when nobody did: a production loaded with no
  // content creator used to come back as `undefined` and take Equipo down on its next render.
  return productionsToEntries([dto])
}

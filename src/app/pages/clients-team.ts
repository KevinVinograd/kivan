import { differenceInCalendarMonths, format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

import type { Compensation, EmploymentType, TeamMemberStatus } from './clients-mock-data'

export const TEAM_STATUS_LABEL: Record<TeamMemberStatus, string> = {
  active: 'Activo',
  paused: 'Pausado',
  inactive: 'Inactivo',
}

export const EMPLOYMENT_TYPE_LABEL: Record<EmploymentType, string> = {
  full_time: 'Full time',
  part_time: 'Part time',
  freelance: 'Freelance',
  external: 'Externo',
}

export type WorkloadStatus = 'low' | 'normal' | 'high'

export const WORKLOAD_LABEL: Record<WorkloadStatus, string> = {
  low: 'Baja',
  normal: 'Normal',
  high: 'Alta',
}

export const COMPENSATION_MODEL_LABEL: Record<Compensation['model'], string> = {
  hourly: 'Por hora',
  monthly_fixed: 'Fijo mensual',
  per_production: 'Por proyecto',
  mixed: 'Mixto',
}

export type GreetingUser = { name: string; firstName?: string; nickname?: string }

export function greetingName(user: GreetingUser): string {
  return user.nickname ?? user.firstName ?? user.name.split(' ')[0] ?? user.name
}


function humanizeMonths(totalMonths: number): string {
  const years = Math.floor(totalMonths / 12)
  const months = totalMonths % 12
  const parts: string[] = []
  if (years >= 1) parts.push(`${years} ${years === 1 ? 'año' : 'años'}`)
  if (months >= 1 || years === 0) parts.push(`${months} ${months === 1 ? 'mes' : 'meses'}`)
  return parts.join(' ')
}

export function durationSince(iso?: string): string | undefined {
  if (!iso) return undefined
  return humanizeMonths(Math.max(0, differenceInCalendarMonths(new Date(), parseISO(iso))))
}

export function formatShortDate(iso?: string): string | undefined {
  if (!iso) return undefined
  return format(parseISO(iso), 'd LLL yyyy', { locale: es })
}

export type TeamMemberPreview = {
  member: {
    id: string
    name: string
    avatarUrl?: string
    role: string
    status: TeamMemberStatus
    employmentType: EmploymentType
    startDate?: string
  }
  currentClientAssignment: {
    clientId: string
    clientName: string
    roleOnClient: string
    assignedSince?: string
    durationLabel?: string
    currentMonthHours?: number
    currentMonthProductions?: number
    estimatedClientCost?: number
    allocationPercent?: number
  }
  compensation?: Compensation
  general: {
    activeClientsCount: number
    totalCurrentMonthHours?: number
    agencyTenureLabel?: string
    lastEntryDate?: string
    workloadStatus?: WorkloadStatus
  }
  clientAssignments: {
    clientId: string
    clientName: string
    roleOnClient: string
    assignedSince?: string
    durationLabel?: string
    currentMonthHours?: number
  }[]
  permissions: {
    canViewCompensation: boolean
  }
}

export function teamMemberPreview(_memberId: string, _clientId: string): TeamMemberPreview | null {
  return null
}

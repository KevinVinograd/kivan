/**
 * Team-member preview + greeting/label helpers behind the Clients detail "Equipo" row.
 *
 * `teamMemberPreview` defines the backend-swappable `TeamMemberPreview` DTO but has no
 * source that assembles a member's cross-client workload yet, so it returns null and the
 * hover card falls back to the plain member name (the list itself comes from the real
 * team snapshot). The DTO shape is kept so wiring a real query later is a one-file change.
 */
import { differenceInCalendarMonths, format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

import type { Compensation, EmploymentType, TeamMemberStatus } from './clients-mock-data'

// ── Labels ───────────────────────────────────────────────────────────────────
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

// A second copy of `PAYMENT_TYPE_LABEL` (team-format.ts), for the client-side team
// surfaces. Nothing ties the two together, so a label changed in one and not the other
// shows the studio two different words for one pay model. Keep them in step by hand.
export const COMPENSATION_MODEL_LABEL: Record<Compensation['model'], string> = {
  hourly: 'Por hora',
  monthly_fixed: 'Fijo mensual',
  per_production: 'Por proyecto',
  mixed: 'Mixto',
}

/** Minimal identity shape consumed by `greetingName`. */
export type GreetingUser = { name: string; firstName?: string; nickname?: string }

/** Greeting name for dashboard titles: prefers the nickname (apodo) when set,
 *  then the explicit first name, then the first token of the full name. */
export function greetingName(user: GreetingUser): string {
  return user.nickname ?? user.firstName ?? user.name.split(' ')[0] ?? user.name
}


// ── Date / duration helpers ──────────────────────────────────────────────────
function humanizeMonths(totalMonths: number): string {
  const years = Math.floor(totalMonths / 12)
  const months = totalMonths % 12
  const parts: string[] = []
  if (years >= 1) parts.push(`${years} ${years === 1 ? 'año' : 'años'}`)
  if (months >= 1 || years === 0) parts.push(`${months} ${months === 1 ? 'mes' : 'meses'}`)
  return parts.join(' ')
}

/** "1 año 3 meses" / "8 meses" since an ISO date, or undefined when absent. */
export function durationSince(iso?: string): string | undefined {
  if (!iso) return undefined
  return humanizeMonths(Math.max(0, differenceInCalendarMonths(new Date(), parseISO(iso))))
}

/** Short "12 Jun 2026" date for the "última carga" line. */
export function formatShortDate(iso?: string): string | undefined {
  if (!iso) return undefined
  return format(parseISO(iso), 'd LLL yyyy', { locale: es })
}

// ── Preview DTO ──────────────────────────────────────────────────────────────
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
  /** Present only when the viewer may see compensation. */
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

/**
 * Assembles the preview DTO for a member as seen from a specific client.
 * Returns null when the member id is unknown. Per-client figures come from the
 * normalized `clientAssignments` table; agency-wide figures are aggregated from
 * the member's active assignments.
 */
export function teamMemberPreview(_memberId: string, _clientId: string): TeamMemberPreview | null {
  // No backend source assembles a member's cross-client workload/compensation yet, so the
  // hover card falls back to the plain member name (TeamMemberHoverCard renders just the
  // trigger when this is null). The team list itself comes from the real team snapshot.
  return null
}

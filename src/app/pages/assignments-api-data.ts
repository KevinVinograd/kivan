/**
 * Bridges the persona↔cliente assignment API to the front's `ClientAssignment`.
 *
 * These relationships were local-state-only until now: `assignMemberToClient` and
 * `endMemberAssignment` mutated a snapshot and the dialog toasted success on the
 * spot, so an assignment survived exactly as long as the tab stayed open. The
 * endpoints had existed since the clients module shipped — the front had simply
 * never called them.
 */
import {
  clientsApi,
  type ClientAssignmentDto,
  type CreateAssignmentInput,
  type UpdateAssignmentInput,
} from '@/api/clients'
import { toIsoDate } from '@/app/lib/iso-date'
import type { AssignmentStatus, ClientAssignment } from './clients-mock-data'

/**
 * Map a server row onto the front shape.
 *
 * The three names ride on the DTO, so no caller has to resolve them against a
 * roster or client list it may not have loaded. `clientName` still falls back to
 * the empty string because the front type requires it — a null there would mean the
 * client relation was not included, which the read paths always do.
 */
export function dtoToAssignment(d: ClientAssignmentDto): ClientAssignment {
  return {
    id: d.id,
    clientId: d.clientId,
    clientName: d.clientName ?? '',
    teamMemberId: d.teamMemberId,
    roleOnClient: d.roleOnClient,
    status: d.status as AssignmentStatus,
    ...(d.serviceName ? { serviceName: d.serviceName } : {}),
    // `toIsoDate`, NOT `.slice(0, 10)`. The server sends a UTC instant, and slicing
    // takes the UTC calendar day: assigning at 21:30 in ART (UTC-3) is 00:30Z the
    // NEXT day, so the relationship would read as starting tomorrow — `monthsSince`
    // then returns -1 and the detail shows "-1 meses" over "Desde ago" for something
    // that began in July. `local-date-serialization-check.mjs` bans the combined
    // `.toISOString().slice(...)` form; splitting the two halves across the API
    // boundary walks past its regex but is the identical defect.
    ...(d.assignedSince ? { assignedSince: toIsoDate(new Date(d.assignedSince)) } : {}),
    ...(d.endedAt ? { endedAt: toIsoDate(new Date(d.endedAt)) } : {}),
    ...(d.allocationPercent !== null ? { allocationPercent: d.allocationPercent } : {}),
    ...(d.estimatedMonthlyHours !== null
      ? { estimatedMonthlyHours: d.estimatedMonthlyHours }
      : {}),
    // `!= null`, never truthiness: an agreed cost of ZERO is a real amount the studio
    // decided on, and the column was made nullable precisely so it could be told apart
    // from "nobody entered it". A falsy check here throws that distinction away on
    // every read, and the screen then says "sin costo asignado" about a decision.
    ...(d.monthlyCostMinor != null ? { monthlyCost: Number(d.monthlyCostMinor) / 100 } : {}),
  }
}

/** Every active assignment in the workspace; an employee gets only their own. */
export async function fetchAssignments(): Promise<ClientAssignment[]> {
  const rows = await clientsApi.listAllAssignments()
  return rows.map(dtoToAssignment)
}

/** Raw inputs from the assign dialogs, on either side of the relationship. */
export interface AssignInput {
  roleOnClient: string
  /** The catalogued service, when one was picked. A real FK now, not a label. */
  serviceId?: string
  estimatedMonthlyHours?: number
  /** Major units, as the dialog collects it. `0` is a real value; `undefined` is not. */
  monthlyCost?: number
}

/** Persist a new assignment and return it in the front shape. */
export async function assignViaApi(
  clientId: string,
  teamMemberId: string,
  input: AssignInput,
): Promise<ClientAssignment> {
  const body: CreateAssignmentInput = {
    teamMemberId,
    roleOnClient: input.roleOnClient,
    ...(input.serviceId ? { serviceId: input.serviceId } : {}),
    ...(input.estimatedMonthlyHours ? { estimatedMonthlyHours: input.estimatedMonthlyHours } : {}),
    // `!= null`, NOT the truthiness spread the two fields above use. Those can afford
    // it — a role of 0 hours reads as unset either way. This one cannot: a typed 0
    // means the studio agreed this client costs nothing, and a falsy check drops it
    // from the body, so the server keeps whatever it had and the toast still says
    // saved.
    ...(input.monthlyCost != null
      ? { monthlyCostMinor: String(Math.round(input.monthlyCost * 100)) }
      : {}),
  }
  return dtoToAssignment(await clientsApi.createAssignment(clientId, body))
}

/**
 * Correct a live assignment in place.
 *
 * `null` is a first-class value here and means ERASE: an operator who clears the cost
 * field is saying they no longer know it, which is not the same as agreeing it is zero.
 * The caller passes `null` explicitly for that; omitting the key leaves it alone.
 */
export async function updateAssignmentViaApi(
  assignmentId: string,
  input: { monthlyCost?: number | null; estimatedMonthlyHours?: number; roleOnClient?: string },
): Promise<ClientAssignment> {
  const body: UpdateAssignmentInput = {
    ...(input.roleOnClient ? { roleOnClient: input.roleOnClient } : {}),
    ...(input.estimatedMonthlyHours != null
      ? { estimatedMonthlyHours: input.estimatedMonthlyHours }
      : {}),
    ...(input.monthlyCost !== undefined
      ? {
          monthlyCostMinor:
            input.monthlyCost === null ? null : String(Math.round(input.monthlyCost * 100)),
        }
      : {}),
  }
  return dtoToAssignment(await clientsApi.updateAssignment(assignmentId, body))
}

/**
 * End an assignment. A SOFT end server-side, so the row comes back with
 * `status: 'ended'` and its `endedAt` — history stays attributable, which is what
 * lets a mid-month baja keep its hours and productions.
 */
export async function endAssignmentViaApi(assignmentId: string): Promise<ClientAssignment> {
  return dtoToAssignment(await clientsApi.endAssignment(assignmentId))
}

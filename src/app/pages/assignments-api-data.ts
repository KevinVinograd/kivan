import {
  clientsApi,
  type ClientAssignmentDto,
  type CreateAssignmentInput,
  type UpdateAssignmentInput,
} from '@/api/clients'
import { toIsoDate } from '@/app/lib/iso-date'
import type { AssignmentStatus, ClientAssignment } from './clients-mock-data'

export function dtoToAssignment(d: ClientAssignmentDto): ClientAssignment {
  return {
    id: d.id,
    clientId: d.clientId,
    clientName: d.clientName ?? '',
    teamMemberId: d.teamMemberId,
    roleOnClient: d.roleOnClient,
    status: d.status as AssignmentStatus,
    ...(d.serviceName ? { serviceName: d.serviceName } : {}),
    ...(d.assignedSince ? { assignedSince: toIsoDate(new Date(d.assignedSince)) } : {}),
    ...(d.endedAt ? { endedAt: toIsoDate(new Date(d.endedAt)) } : {}),
    ...(d.allocationPercent !== null ? { allocationPercent: d.allocationPercent } : {}),
    ...(d.estimatedMonthlyHours !== null
      ? { estimatedMonthlyHours: d.estimatedMonthlyHours }
      : {}),
    ...(d.monthlyCostMinor != null ? { monthlyCost: Number(d.monthlyCostMinor) / 100 } : {}),
  }
}

export async function fetchAssignments(): Promise<ClientAssignment[]> {
  const rows = await clientsApi.listAllAssignments()
  return rows.map(dtoToAssignment)
}

export interface AssignInput {
  roleOnClient: string
  serviceId?: string
  estimatedMonthlyHours?: number
  monthlyCost?: number
}

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
    ...(input.monthlyCost != null
      ? { monthlyCostMinor: String(Math.round(input.monthlyCost * 100)) }
      : {}),
  }
  return dtoToAssignment(await clientsApi.createAssignment(clientId, body))
}

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

export async function endAssignmentViaApi(assignmentId: string): Promise<ClientAssignment> {
  return dtoToAssignment(await clientsApi.endAssignment(assignmentId))
}

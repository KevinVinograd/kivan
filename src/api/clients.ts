import { z } from 'zod'
import { ClientStatus, Currency, ServiceBillingMode } from '@hold/shared'
import { apiClient } from './client'

// Money is integer minor units (centavos) serialized as strings.
export const ClientSchema = z.object({
  id: z.string(),
  name: z.string(),
  businessName: z.string().nullable(),
  taxId: z.string().nullable(),
  status: ClientStatus,
  monthlyFeeMinor: z.string(),
  currency: Currency,
  billingEntityId: z.string().nullable(),
  startDate: z.string().nullable(),
  lastIncreaseDate: z.string().nullable(),
  clientType: z.string().nullable().optional(),
  services: z.array(z.string()).default([]),
  paymentMethod: z.string().nullable().optional(),
  discountPercentBp: z.number().nullable().optional(),
  billingCycle: z.string().nullable().optional(),
  projectFeeMinor: z.string().nullable().optional(),
  projectEndDate: z.string().nullable().optional(),
  contactName: z.string().nullable(),
  billingEmail: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable().optional(),
  secondaryEmail: z.string().nullable().optional(),
  adminContactName: z.string().nullable().optional(),
  adminContactEmail: z.string().nullable().optional(),
  adminContactPhone: z.string().nullable().optional(),
  createdAt: z.string(),
})
export type ClientDto = z.infer<typeof ClientSchema>

export const PaginatedClientsSchema = z.object({
  items: z.array(ClientSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
})
export type PaginatedClientsDto = z.infer<typeof PaginatedClientsSchema>

export interface CreateClientInput {
  name: string
  status?: string
  monthlyFeeMinor?: string
  currency?: string
  businessName?: string
  taxId?: string
  billingEntityId?: string
  startDate?: string
  clientType?: string
  services?: string[]
  paymentMethod?: string
  discountPercentBp?: number | null
  billingCycle?: string
  projectFeeMinor?: string
  projectEndDate?: string
  contactName?: string
  billingEmail?: string
  phone?: string
  address?: string | null
  secondaryEmail?: string
  adminContactName?: string
  adminContactEmail?: string
  adminContactPhone?: string
}

export type UpdateClientInput = Partial<CreateClientInput>

export const ClientAssignmentSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  teamMemberId: z.string(),
  serviceId: z.string().nullable(),
  roleOnClient: z.string(),
  status: z.string(),
  allocationPercent: z.number().nullable(),
  estimatedMonthlyHours: z.number().nullable(),
  monthlyCostMinor: z.string().nullable().optional(),
  assignedSince: z.string().nullable(),
  endedAt: z.string().nullable(),
  clientName: z.string().nullable(),
  teamMemberName: z.string().nullable(),
  serviceName: z.string().nullable(),
})

export const ClientAssignmentsSchema = z.array(ClientAssignmentSchema)

export const ClientServiceSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  serviceId: z.string().nullable(),
  name: z.string(),
  priceMinor: z.string(),
  active: z.boolean(),
  billingMode: ServiceBillingMode.default('monthly'),
  includedHours: z.number().nullable().default(null),
  billedMinor: z.string().nullable().default(null),
  sortOrder: z.number(),
})
export type ClientServiceDto = z.infer<typeof ClientServiceSchema>
export const ClientServicesSchema = z.array(ClientServiceSchema)

export interface CreateServiceLineInput {
  name: string
  priceMinor: string
  serviceId?: string | null
  active?: boolean
  billingMode?: ServiceBillingMode
  includedHours?: number | null
  sortOrder?: number
}

export type ClientAssignmentDto = z.infer<typeof ClientAssignmentSchema>

export interface CreateAssignmentInput {
  teamMemberId: string
  roleOnClient: string
  serviceId?: string
  allocationPercent?: number
  estimatedMonthlyHours?: number
  monthlyCostMinor?: string | null
}

export type UpdateAssignmentInput = Partial<Omit<CreateAssignmentInput, 'teamMemberId'>>

export const clientsApi = {
  list: (params?: { limit?: number; offset?: number; status?: string }) =>
    apiClient.get<PaginatedClientsDto>('/clients', {
      ...(params ? { params } : {}),
      schema: PaginatedClientsSchema,
    }),
  create: (input: CreateClientInput) =>
    apiClient.post<ClientDto>('/clients', input, { schema: ClientSchema }),
  update: (id: string, input: UpdateClientInput) =>
    apiClient.put<ClientDto>(`/clients/${id}`, input, { schema: ClientSchema }),
  setStatus: (id: string, status: string) =>
    apiClient.post<ClientDto>(`/clients/${id}/status`, { status }, { schema: ClientSchema }),
  remove: (id: string) => apiClient.delete<ClientDto>(`/clients/${id}`, { schema: ClientSchema }),

  listAllAssignments: () =>
    apiClient.get<ClientAssignmentDto[]>('/assignments', { schema: ClientAssignmentsSchema }),
  listAssignments: (clientId: string) =>
    apiClient.get<ClientAssignmentDto[]>(`/clients/${clientId}/assignments`, {
      schema: ClientAssignmentsSchema,
    }),
  listAssignmentsForMember: (teamMemberId: string) =>
    apiClient.get<ClientAssignmentDto[]>(`/team-members/${teamMemberId}/assignments`, {
      schema: ClientAssignmentsSchema,
    }),
  createAssignment: (clientId: string, input: CreateAssignmentInput) =>
    apiClient.post<ClientAssignmentDto>(`/clients/${clientId}/assignments`, input, {
      schema: ClientAssignmentSchema,
    }),
  updateAssignment: (assignmentId: string, input: UpdateAssignmentInput) =>
    apiClient.patch<ClientAssignmentDto>(`/assignments/${assignmentId}`, input, {
      schema: ClientAssignmentSchema,
    }),
  listServiceLines: (clientId: string) =>
    apiClient.get<ClientServiceDto[]>(`/clients/${clientId}/service-lines`, {
      schema: ClientServicesSchema,
    }),
  createServiceLine: (clientId: string, input: CreateServiceLineInput) =>
    apiClient.post<ClientServiceDto>(`/clients/${clientId}/service-lines`, input, {
      schema: ClientServiceSchema,
    }),
  updateServiceLine: (lineId: string, input: Partial<CreateServiceLineInput>) =>
    apiClient.patch<ClientServiceDto>(`/service-lines/${lineId}`, input, {
      schema: ClientServiceSchema,
    }),
  removeServiceLine: (lineId: string) =>
    apiClient.delete<ClientServiceDto>(`/service-lines/${lineId}`, {
      schema: ClientServiceSchema,
    }),
  endAssignment: (assignmentId: string) =>
    apiClient.delete<ClientAssignmentDto>(`/assignments/${assignmentId}`, {
      schema: ClientAssignmentSchema,
    }),
}

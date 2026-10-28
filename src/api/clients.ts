/** Clients resource calls — thin typed wrappers over the api client. */
import { z } from 'zod'
import { ClientStatus, Currency, ServiceBillingMode } from '@hold/shared'
import { apiClient } from './client'

/** Raw Client entity as `GET /clients` returns it. Money is integer minor units
 *  (centavos) serialized as a string; the front converts to major units. Enum
 *  fields reuse the canonical `@hold/shared` enums, so a value the contract never
 *  declared throws at the fetch boundary instead of flowing into the UI. */
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
  // The commercial-term fields are `.optional()` as well as `.nullable()` for ONE
  // release. Deploy Web (S3 + CloudFront, ~2 min) and Deploy API (build, push, SSM,
  // migrate, health gate, ~10 min) fire independently with no `needs:`, so the new
  // bundle runs against the old API for several minutes after every push to main.
  // Required keys would make `ClientSchema.parse` throw in that window and put
  // /clientes into its error state — and a create would write the row, throw on the
  // response, and invite the operator to retry into a duplicate. Tighten to plain
  // `.nullable()` once this has shipped.
  clientType: z.string().nullable().optional(),
  services: z.array(z.string()).default([]),
  paymentMethod: z.string().nullable().optional(),
  // The standing discount, in basis points (1000 = 10%). A number, not a string:
  // it is a rate, not money, so it never goes through the minor-units conversion.
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
  /** The fee's own currency lane (`ARS` | `USD`); never converted. */
  currency?: string
  businessName?: string
  taxId?: string
  /** Emisor code (`monotributo_1` | `monotributo_2` | `monotributo_3`). */
  billingEntityId?: string
  /** ISO date. When the client's relationship started, not when the row was created. */
  startDate?: string
  /** The client's rubro, from a closed list in the UI. */
  clientType?: string
  services?: string[]
  /** How the client normally pays: `cash` | `transfer`. */
  paymentMethod?: string
  /**
   * Standing discount off the monthly fee, in basis points (1000 = 10%).
   *
   * `null` is meaningful and distinct from omitting the key: null CLEARS the rate,
   * omission leaves it alone. Every other optional here can only be set, never
   * erased — see `toClientPayload`, which drops blanks by conditional spread.
   */
  discountPercentBp?: number | null
  /** `arrears` (mes vencido) | `current` (mes corriendo). Recorded, not enforced. */
  billingCycle?: string
  projectFeeMinor?: string
  projectEndDate?: string
  contactName?: string
  billingEmail?: string
  phone?: string
  /** The client's domicilio. `null` clears it; see `discountPercentBp` above. */
  address?: string | null
  secondaryEmail?: string
  adminContactName?: string
  adminContactEmail?: string
  adminContactPhone?: string
}

/** Body for `PUT /clients/:id` — partial of the create shape, at least one field. */
export type UpdateClientInput = Partial<CreateClientInput>

/**
 * One persona↔cliente relationship.
 *
 * The three `*Name` fields are denormalized by the server, so a surface can render
 * a row without joining it against a roster or a client list it may not have loaded.
 * `serviceName` is null when the assignment carries no service — which was its only
 * possible value until the `Service` catalog gained a write path.
 */
export const ClientAssignmentSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  teamMemberId: z.string(),
  serviceId: z.string().nullable(),
  roleOnClient: z.string(),
  status: z.string(),
  allocationPercent: z.number().nullable(),
  estimatedMonthlyHours: z.number().nullable(),
  // What the studio pays for this member on this client, in minor units. `.optional()`
  // as well as `.nullable()` for one release: Deploy Web and Deploy API fire
  // independently, so the new bundle meets the old API for minutes after every push,
  // and a required key would throw in `parse` and blank every assignment surface.
  //
  // `null` carries two meanings the client cannot separate, on purpose: never entered,
  // or withheld because the reader lacks `teamCost`. Neither may render as zero.
  monthlyCostMinor: z.string().nullable().optional(),
  assignedSince: z.string().nullable(),
  endedAt: z.string().nullable(),
  clientName: z.string().nullable(),
  teamMemberName: z.string().nullable(),
  serviceName: z.string().nullable(),
})

export const ClientAssignmentsSchema = z.array(ClientAssignmentSchema)

/**
 * One priced service on a client's contract. Its sum IS the client's monthly fee.
 *
 * `name` is stamped on the line, not joined from the catalog: the contract keeps the
 * label it was signed under even if the catalog entry is renamed later.
 */
export const ClientServiceSchema = z.object({
  id: z.string(),
  clientId: z.string(),
  serviceId: z.string().nullable(),
  name: z.string(),
  priceMinor: z.string(),
  active: z.boolean(),
  /**
   * How the line becomes money. Only `monthly` lines form the fee. Defaulted so a
   * browser that deploys ahead of the API reads every line as the monthly line it was.
   */
  billingMode: ServiceBillingMode.default('monthly'),
  /** Per-hour lines only: hours a month the retainer includes; past them the hours bill at
   *  the price. Null = none. Defaulted for a browser ahead of the API. */
  includedHours: z.number().nullable().default(null),
  /** One-time lines only: how much of the price is already in cobros (contract currency). */
  billedMinor: z.string().nullable().default(null),
  sortOrder: z.number(),
})
export type ClientServiceDto = z.infer<typeof ClientServiceSchema>
export const ClientServicesSchema = z.array(ClientServiceSchema)

/** Body for `POST /clients/:id/service-lines`. */
export interface CreateServiceLineInput {
  name: string
  /** Minor units, as a string — the same convention as every other money field. */
  priceMinor: string
  serviceId?: string | null
  active?: boolean
  billingMode?: ServiceBillingMode
  /** Per-hour lines only; null clears them. */
  includedHours?: number | null
  sortOrder?: number
}

export type ClientAssignmentDto = z.infer<typeof ClientAssignmentSchema>

/** Body for `POST /clients/:id/assignments`. */
export interface CreateAssignmentInput {
  teamMemberId: string
  roleOnClient: string
  serviceId?: string
  allocationPercent?: number
  estimatedMonthlyHours?: number
  /**
   * Minor units, as a string like every other money field on the wire.
   *
   * Three distinct states: absent = leave it alone, `null` = erase it, `'0'` = the
   * studio agreed this client costs nothing. Any truthiness check on this value
   * collapses the last two, and `'0'` is the one the nullable column exists to keep.
   */
  monthlyCostMinor?: string | null
}

/** Body for `PATCH /assignments/:id` — partial, at least one field. */
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
  /** Delete a client (soft on the backend): it leaves every list and detail read. */
  remove: (id: string) => apiClient.delete<ClientDto>(`/clients/${id}`, { schema: ClientSchema }),

  // ── Assignments (persona ↔ cliente) ────────────────────────────────────────
  /**
   * Every active assignment in the workspace — one request instead of one per
   * client. An employee gets only their own rows, same as `GET /clients`.
   */
  listAllAssignments: () =>
    apiClient.get<ClientAssignmentDto[]>('/assignments', { schema: ClientAssignmentsSchema }),
  /** Everyone actively assigned to a client. An employee sees only their own rows. */
  listAssignments: (clientId: string) =>
    apiClient.get<ClientAssignmentDto[]>(`/clients/${clientId}/assignments`, {
      schema: ClientAssignmentsSchema,
    }),
  /**
   * The mirror direction — every client one member is on.
   *
   * A separate endpoint rather than a filter, because the privacy rule differs: a
   * manager may read anyone's, an employee only their own (a colleague's roster
   * would reveal which accounts that person works). A refusal is a 403, never an
   * empty list — an empty roster is a real state.
   */
  listAssignmentsForMember: (teamMemberId: string) =>
    apiClient.get<ClientAssignmentDto[]>(`/team-members/${teamMemberId}/assignments`, {
      schema: ClientAssignmentsSchema,
    }),
  createAssignment: (clientId: string, input: CreateAssignmentInput) =>
    apiClient.post<ClientAssignmentDto>(`/clients/${clientId}/assignments`, input, {
      schema: ClientAssignmentSchema,
    }),
  /**
   * Correct an assignment in place.
   *
   * The alternative was end-and-recreate — the partial unique index on (client, member)
   * permits nothing else — which rewrites the member's tenure line, so fixing a typo
   * would read as a staffing change ever after.
   */
  updateAssignment: (assignmentId: string, input: UpdateAssignmentInput) =>
    apiClient.patch<ClientAssignmentDto>(`/assignments/${assignmentId}`, input, {
      schema: ClientAssignmentSchema,
    }),
  // ── Priced contract lines (servicios valorizados) ─────────────────────────
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
  /** Remove a line. SOFT on the backend, so the cobros that cite it stay explicable. */
  removeServiceLine: (lineId: string) =>
    apiClient.delete<ClientServiceDto>(`/service-lines/${lineId}`, {
      schema: ClientServiceSchema,
    }),
  /** End an assignment. A SOFT end server-side: the row survives as history. */
  endAssignment: (assignmentId: string) =>
    apiClient.delete<ClientAssignmentDto>(`/assignments/${assignmentId}`, {
      schema: ClientAssignmentSchema,
    }),
}

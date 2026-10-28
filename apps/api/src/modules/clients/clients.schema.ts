/** Edge validation (Zod) + DTOs for the Clients module. */
import { z } from 'zod';
import { ClientStatus, Currency, MinorUnitsNonNeg, ServiceBillingMode, AssignmentArea } from '@hold/shared';

/** How the client normally pays. A property of the client, not of each cobro. */
export const PaymentMethod = z.enum(['cash', 'transfer']);

/**
 * `arrears` = mes vencido, `current` = mes corriendo. RECORDED, NOT ENFORCED:
 * nothing derives a period or a due date from it yet, so it is a policy label the
 * operator still applies by hand when creating each cobro.
 */
export const BillingCycle = z.enum(['arrears', 'current']);

/**
 * The client field shapes WITHOUT create-time defaults.
 *
 * `updateClientSchema` MUST be built from this, never from
 * `createClientSchema.partial()`: Zod keeps `.default()` alive through
 * `.partial()`, so a partial derived from the create schema re-injects
 * `status: 'onboarding'` and `currency: 'ARS'` into every body that omits them.
 * That turned an unrelated edit (a contact name, a phone) into a silent
 * lifecycle reset, and reverted a non-ARS client to pesos on every save.
 */
const clientFields = {
  name: z.string().trim().min(1).max(200),
  businessName: z.string().trim().max(200).optional(),
  taxId: z.string().trim().max(40).optional(),
  status: ClientStatus,
  monthlyFeeMinor: MinorUnitsNonNeg.optional(),
  currency: Currency,
  billingEntityId: z.string().trim().max(60).optional(),
  startDate: z.coerce.date().optional(),
  lastIncreaseDate: z.coerce.date().optional(),
  clientType: z.string().trim().max(60).optional(),
  services: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  paymentMethod: PaymentMethod.optional(),
  // Basis points (1000 = 10%), so the rate stays an integer all the way to the
  // cobro. The DB CHECK mirrors this range; this is the edge that should reject
  // first, with a field-level message instead of a 500 from Postgres.
  discountPercentBp: z.number().int().min(0).max(10000).nullable().optional(),
  billingCycle: BillingCycle.optional(),
  projectFeeMinor: MinorUnitsNonNeg.optional(),
  projectEndDate: z.coerce.date().optional(),
  contactName: z.string().trim().max(200).optional(),
  billingEmail: z.string().email().max(254).optional(),
  phone: z.string().trim().max(40).optional(),
  // Nullable, unlike every field above it: these two are the only ones the form
  // can CLEAR. `toClientPayload` omits blanks by conditional spread, so an emptied
  // input never reaches the server as anything — a wrong discount rate would live
  // forever. Sending an explicit null is what erases the value.
  address: z.string().trim().max(300).nullable().optional(),
  secondaryEmail: z.string().email().max(254).optional(),
  adminContactName: z.string().trim().max(200).optional(),
  adminContactEmail: z.string().email().max(254).optional(),
  adminContactPhone: z.string().trim().max(40).optional(),
};

export const createClientSchema = z.object({
  ...clientFields,
  status: clientFields.status.default('onboarding'),
  currency: clientFields.currency.default('ARS'),
});
export type CreateClientInput = z.infer<typeof createClientSchema>;

export const updateClientSchema = z
  .object(clientFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' });
export type UpdateClientInput = z.infer<typeof updateClientSchema>;

export const changeClientStatusSchema = z.object({ status: ClientStatus });

export const listClientsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const clientIdParamSchema = z.object({ id: z.uuid() });
export const assignmentIdParamSchema = z.object({ id: z.uuid() });
export const serviceLineIdParamSchema = z.object({ id: z.uuid() });

/**
 * A priced service on a client's contract.
 *
 * `name` is stamped rather than joined: the line keeps the label it was contracted
 * under even if the catalog entry is renamed later, the same reason a receivable stores
 * its own client name.
 */
const serviceLineFields = {
  name: z.string().trim().min(1).max(60),
  priceMinor: MinorUnitsNonNeg,
  serviceId: z.uuid().nullable().optional(),
  active: z.boolean().optional(),
  /** Omitted on create = monthly, the meaning every line had before modes existed. */
  billingMode: ServiceBillingMode.optional(),
  /** Per-hour lines only: hours a month the retainer includes (null = none). Kept only on
   *  a per-hour line; any other mode stores null (`clientsService`). */
  includedHours: z.number().min(0).max(744).nullable().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
};

export const createServiceLineSchema = z.object(serviceLineFields);
export type CreateServiceLineInput = z.infer<typeof createServiceLineSchema>;

export const updateServiceLineSchema = z
  .object(serviceLineFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' });
export type UpdateServiceLineInput = z.infer<typeof updateServiceLineSchema>;

export interface ClientServiceDto {
  id: string;
  clientId: string;
  serviceId: string | null;
  name: string;
  priceMinor: string;
  active: boolean;
  billingMode: ServiceBillingMode;
  /** Hours a month a per-hour line includes; past them the hours bill at `priceMinor`.
   *  Null = none, and always null on any other mode. */
  includedHours: number | null;
  /**
   * How much of a `one_time` line's price has already been turned into cobros, in the
   * CONTRACT's currency (non-cancelled cobros only). Null on every other mode: a monthly
   * or per-production price is never "used up", and a zero there would read as a claim.
   */
  billedMinor: string | null;
  sortOrder: number;
}

export function toServiceLineDto(
  r: {
    id: string;
    clientId: string;
    serviceId: string | null;
    name: string;
    priceMinor: bigint;
    active: boolean;
    billingMode: ServiceBillingMode;
    includedHours: number | null;
    sortOrder: number;
  },
  /** Required, never defaulted: see `capability-flag`-style mapper traps — a mapper used
   *  through `rows.map(toDto)` would receive the array INDEX here. Pass null explicitly. */
  billedMinor: bigint | null,
): ClientServiceDto {
  return {
    id: r.id,
    clientId: r.clientId,
    serviceId: r.serviceId,
    name: r.name,
    priceMinor: r.priceMinor.toString(),
    active: r.active,
    billingMode: r.billingMode,
    includedHours: r.billingMode === 'per_hour' ? r.includedHours : null,
    billedMinor: r.billingMode === 'one_time' ? (billedMinor ?? 0n).toString() : null,
    sortOrder: r.sortOrder,
  };
}

/**
 * The assignment field shapes, shared by create and update.
 *
 * `updateAssignmentSchema` is built from THIS, never from
 * `createAssignmentSchema.partial()` — the same trap `clientFields` documents above:
 * Zod keeps `.default()` alive through `.partial()`, so a partial derived from a
 * create schema re-injects defaults into every body that omits them.
 */
const assignmentFields = {
  serviceId: z.uuid().optional(),
  // A closed list since 2026-10 (see `ASSIGNMENT_AREAS`). Only WRITES are validated:
  // the read DTO below stays a plain string, because rows from before the list still
  // carry the free text they were created with.
  roleOnClient: AssignmentArea,
  allocationPercent: z.number().int().min(0).max(100).optional(),
  estimatedMonthlyHours: z.number().int().min(0).max(1000).optional(),
  /**
   * What the studio pays this member for this client per month, in minor units.
   *
   * Nullable AND optional, and the three states differ: absent = leave it alone,
   * `null` = erase it, `'0'` = the studio agreed this client costs nothing. A
   * truthiness check anywhere on this path collapses the last two.
   */
  monthlyCostMinor: MinorUnitsNonNeg.nullable().optional(),
};

export const createAssignmentSchema = z.object({
  teamMemberId: z.uuid(),
  ...assignmentFields,
});
export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;

export const updateAssignmentSchema = z
  .object(assignmentFields)
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'At least one field must be provided' });
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;

export interface ClientDto {
  id: string;
  name: string;
  businessName: string | null;
  taxId: string | null;
  status: string;
  monthlyFeeMinor: string;
  currency: string;
  billingEntityId: string | null;
  startDate: string | null;
  lastIncreaseDate: string | null;
  clientType: string | null;
  services: string[];
  paymentMethod: string | null;
  discountPercentBp: number | null;
  billingCycle: string | null;
  projectFeeMinor: string | null;
  projectEndDate: string | null;
  contactName: string | null;
  billingEmail: string | null;
  phone: string | null;
  address: string | null;
  secondaryEmail: string | null;
  adminContactName: string | null;
  adminContactEmail: string | null;
  adminContactPhone: string | null;
  createdAt: string;
}

export interface PaginatedClientsDto {
  items: ClientDto[];
  total: number;
  limit: number;
  offset: number;
}

export interface ClientAssignmentDto {
  id: string;
  clientId: string;
  teamMemberId: string;
  serviceId: string | null;
  roleOnClient: string;
  status: string;
  allocationPercent: number | null;
  estimatedMonthlyHours: number | null;
  /**
   * What we pay this member for this client per month, in minor units.
   *
   * `null` means one of two things the caller cannot distinguish, deliberately: the
   * amount was never entered, or the reader does not hold `teamCost` and the figure
   * was withheld. Both render as absence; neither may render as zero.
   */
  monthlyCostMinor: string | null;
  assignedSince: string | null;
  endedAt: string | null;
  /**
   * Denormalized names, because every surface that renders an assignment renders
   * them. Without these the client detail resolves each row's member out of the
   * roster and the team detail resolves each row's client out of the client list —
   * two joins the front would do by hand, on lists it may not have loaded.
   *
   * `serviceName` is null when the assignment carries no service. That was the ONLY
   * possible value until this branch: nothing could create a `Service` to point at.
   */
  clientName: string | null;
  teamMemberName: string | null;
  serviceName: string | null;
}

interface ClientRecord {
  id: string;
  name: string;
  businessName: string | null;
  taxId: string | null;
  status: string;
  monthlyFeeMinor: bigint;
  currency: string;
  billingEntityId: string | null;
  startDate: Date | null;
  lastIncreaseDate: Date | null;
  clientType: string | null;
  services: string[];
  paymentMethod: string | null;
  discountPercentBp: number | null;
  billingCycle: string | null;
  projectFeeMinor: bigint | null;
  projectEndDate: Date | null;
  contactName: string | null;
  billingEmail: string | null;
  phone: string | null;
  address: string | null;
  secondaryEmail: string | null;
  adminContactName: string | null;
  adminContactEmail: string | null;
  adminContactPhone: string | null;
  createdAt: Date;
}

export function toClientDto(r: ClientRecord): ClientDto {
  return {
    id: r.id,
    name: r.name,
    businessName: r.businessName,
    taxId: r.taxId,
    status: r.status,
    monthlyFeeMinor: r.monthlyFeeMinor.toString(),
    currency: r.currency,
    billingEntityId: r.billingEntityId,
    startDate: r.startDate?.toISOString() ?? null,
    lastIncreaseDate: r.lastIncreaseDate?.toISOString() ?? null,
    clientType: r.clientType,
    services: r.services,
    paymentMethod: r.paymentMethod,
    discountPercentBp: r.discountPercentBp,
    billingCycle: r.billingCycle,
    projectFeeMinor: r.projectFeeMinor?.toString() ?? null,
    projectEndDate: r.projectEndDate?.toISOString() ?? null,
    contactName: r.contactName,
    billingEmail: r.billingEmail,
    phone: r.phone,
    address: r.address,
    secondaryEmail: r.secondaryEmail,
    adminContactName: r.adminContactName,
    adminContactEmail: r.adminContactEmail,
    adminContactPhone: r.adminContactPhone,
    createdAt: r.createdAt.toISOString(),
  };
}

interface AssignmentRecord {
  id: string;
  clientId: string;
  teamMemberId: string;
  serviceId: string | null;
  roleOnClient: string;
  status: string;
  allocationPercent: number | null;
  estimatedMonthlyHours: number | null;
  monthlyCostMinor: bigint | null;
  assignedSince: Date | null;
  endedAt: Date | null;
  // Optional so a caller that did not `include` the relations still type-checks;
  // those get nulls, which read as "not loaded" exactly like "not set". The read
  // paths all include them — see `clients.repo.ts § withNames`.
  client?: { name: string } | null;
  teamMember?: { name: string } | null;
  service?: { name: string } | null;
}

/**
 * @param includeCost whether the reader holds `teamCost`. REQUIRED and undefaulted ON
 * PURPOSE: with a default, `rows.map(toAssignmentDto)` compiles and quietly passes the
 * ARRAY INDEX as the flag — row 0 withheld, every later row leaking what the studio
 * pays per client, 200 OK, and correct-looking on any client whose first assignment
 * you happen to check. Requiring it makes that call a compile error.
 */
export function toAssignmentDto(r: AssignmentRecord, includeCost: boolean): ClientAssignmentDto {
  return {
    id: r.id,
    clientId: r.clientId,
    teamMemberId: r.teamMemberId,
    serviceId: r.serviceId,
    roleOnClient: r.roleOnClient,
    status: r.status,
    allocationPercent: r.allocationPercent,
    estimatedMonthlyHours: r.estimatedMonthlyHours,
    // `?? null`, never `?? '0'`: an absent amount is absent, and the money-privacy
    // boundary withholds by returning the same absence rather than a distinguishable
    // sentinel the front could pattern-match into a hint.
    monthlyCostMinor: includeCost ? (r.monthlyCostMinor?.toString() ?? null) : null,
    assignedSince: r.assignedSince?.toISOString() ?? null,
    endedAt: r.endedAt?.toISOString() ?? null,
    clientName: r.client?.name ?? null,
    teamMemberName: r.teamMember?.name ?? null,
    serviceName: r.service?.name ?? null,
  };
}

/**
 * Bridges the real Clients API to the front's (derived-rich) `Client` shape.
 *
 * The API returns the raw Client ENTITY; the front `Client` additionally carries
 * fields DERIVED from other domains (payment status from receivables, profitability
 * from reports, assigned team/services from assignments). Those default here until
 * their domains are wired — the entity fields (name, status, fee, contact, dates)
 * are real and persist.
 */
import {
  clientsApi,
  type ClientDto,
  type CreateClientInput,
  type UpdateClientInput,
} from '@/api/clients'
import type {
  BillingCycle,
  BillingEntity,
  Client,
  ClientStatus,
  PaymentMethod,
} from './clients-mock-data'
import type { ClientFormValues } from './clients-dialogs'

const BILLING_ENTITIES: readonly BillingEntity[] = [
  'monotributo_1',
  'monotributo_2',
  'monotributo_3',
]

/**
 * The emisor is stored as its code string in `billingEntityId`. A null (nobody has
 * decided yet) stays undefined rather than falling back to the first emisor: the
 * fallback used to be written straight back on the next save, silently converting
 * "no emisor was stated" into "the operator chose Vicky" across the whole book.
 * An unrecognised value is treated the same way as absent.
 */
function toBillingEntity(raw: string | null): BillingEntity | undefined {
  return BILLING_ENTITIES.find((entity) => entity === raw)
}

/** Map the raw API entity onto the front Client, defaulting the derived fields. */
export function dtoToClient(d: ClientDto): Client {
  const monthlyFee = Number(d.monthlyFeeMinor) / 100
  return {
    id: d.id,
    name: d.name,
    businessName: d.businessName ?? undefined,
    taxId: d.taxId ?? undefined,
    status: d.status as ClientStatus,
    clientType: d.clientType ?? undefined,
    services: d.services,
    assignedTeam: [],
    monthlyFee,
    currency: d.currency,
    // The month's money is DELIBERATELY absent here. It used to be fabricated on every
    // successful fetch — `paymentStatus: 'pending'`, `currentMonthPaidAmount: 0`,
    // `currentMonthDueAmount: monthlyFee`, `invoiceStatus: 'not_issued'` — none of which
    // the client DTO carries: a client's money per month lives on receivables, one per
    // service. `clients-receivables.ts` projects the real figures onto the row, and a
    // client with nothing billed this month keeps these undefined so every surface can
    // say so instead of showing the contracted fee as an amount somebody owes.
    billingEntity: toBillingEntity(d.billingEntityId),
    startDate: d.startDate ?? undefined,
    lastIncreaseDate: d.lastIncreaseDate ?? undefined,
    contactName: d.contactName ?? undefined,
    billingEmail: d.billingEmail ?? undefined,
    phone: d.phone ?? undefined,
    address: d.address ?? undefined,
    secondaryEmail: d.secondaryEmail ?? undefined,
    adminContactName: d.adminContactName ?? undefined,
    adminContactEmail: d.adminContactEmail ?? undefined,
    adminContactPhone: d.adminContactPhone ?? undefined,
    paymentMethod: (d.paymentMethod as PaymentMethod | null) ?? undefined,
    discountPercentBp: d.discountPercentBp ?? undefined,
    billingCycle: (d.billingCycle as BillingCycle | null) ?? undefined,
    projectFee: d.projectFeeMinor ? Number(d.projectFeeMinor) / 100 : undefined,
    projectEndDate: d.projectEndDate ?? undefined,
    createdAt: d.createdAt,
    updatedAt: d.createdAt,
  }
}

/** Load the workspace's clients from the API, mapped to the front shape.
 *  The list endpoint caps `limit` at 100, so page through until exhausted. */
export async function fetchClients(): Promise<Client[]> {
  const LIMIT = 100
  const all: ClientDto[] = []
  for (let offset = 0; ; offset += LIMIT) {
    const res = await clientsApi.list({ limit: LIMIT, offset })
    all.push(...res.items)
    if (all.length >= res.total || res.items.length < LIMIT) break
  }
  return all.map(dtoToClient)
}

/**
 * Build the entity payload the backend owns, from the form values.
 *
 * Create and update send the SAME field set on purpose: they used to be two
 * hand-maintained copies, and a field added to one and forgotten in the other is
 * exactly how `phone`, `billingEntityId` and `startDate` ended up collected by the
 * form and silently discarded on the way out.
 *
 * Blank optional fields are omitted rather than sent as `''` — `billingEmail` is
 * validated as an email at the edge and an empty string would be rejected. The
 * consequence is that clearing a field in the form does not clear it server-side;
 * that needs nullable fields in the API contract and is not in this change.
 */
export function toClientPayload(values: ClientFormValues): CreateClientInput {
  return {
    name: values.name,
    status: values.status,
    monthlyFeeMinor: String(Math.round(values.monthlyFee * 100)),
    currency: values.currency,
    // Always sent, including when empty: this is the field whose loss the studio
    // actually reported ("cuando edito un cliente, el servicio se destilda"), so
    // unticking every service has to mean an empty list, not "leave it alone".
    services: values.services,
    // Also always sent, and for the same reason one level up: these two are the only
    // fields the form can CLEAR. Every conditional spread below can set a value but
    // never erase one — an emptied input simply omits the key, and the server keeps
    // what it had. That is tolerable for a phone; it is not tolerable for a discount
    // rate, which would keep taking money off every cobro after the deal ended.
    // `null` is the erase, so the empty form state has to travel as null, not as
    // nothing. The API contract declares both as nullable for exactly this.
    address: values.address ? values.address : null,
    discountPercentBp: values.discountPercent > 0 ? Math.round(values.discountPercent * 100) : null,
    ...(values.businessName ? { businessName: values.businessName } : {}),
    ...(values.taxId ? { taxId: values.taxId } : {}),
    ...(values.billingEntity ? { billingEntityId: values.billingEntity } : {}),
    ...(values.clientType ? { clientType: values.clientType } : {}),
    ...(values.paymentMethod ? { paymentMethod: values.paymentMethod } : {}),
    ...(values.billingCycle ? { billingCycle: values.billingCycle } : {}),
    ...(values.projectFee > 0
      ? { projectFeeMinor: String(Math.round(values.projectFee * 100)) }
      : {}),
    ...(values.projectEndDate ? { projectEndDate: values.projectEndDate } : {}),
    ...(values.contactName ? { contactName: values.contactName } : {}),
    ...(values.billingEmail ? { billingEmail: values.billingEmail } : {}),
    ...(values.phone ? { phone: values.phone } : {}),
    ...(values.secondaryEmail ? { secondaryEmail: values.secondaryEmail } : {}),
    ...(values.adminContactName ? { adminContactName: values.adminContactName } : {}),
    ...(values.adminContactEmail ? { adminContactEmail: values.adminContactEmail } : {}),
    ...(values.adminContactPhone ? { adminContactPhone: values.adminContactPhone } : {}),
    ...(values.startDate ? { startDate: values.startDate } : {}),
  }
}

/**
 * Fold the submitted form values back onto a roster row after a successful PUT.
 *
 * The caller used to spread `values` straight onto the row. That worked only while
 * the two shapes happened to coincide: the form models "not stated" as `''` and a
 * project fee as `0`, while the row models both as `undefined`, so the blind spread
 * put empty strings where the row's own types promise a union member. Mapping them
 * explicitly keeps the row's derived fields (payment status, team) untouched, which
 * is why the merge exists at all: the DTO does not carry them.
 */
export function applyFormToClient(row: Client, values: ClientFormValues): Client {
  return {
    ...row,
    name: values.name,
    businessName: values.businessName || undefined,
    taxId: values.taxId || undefined,
    clientType: values.clientType || undefined,
    status: values.status,
    services: [...values.services],
    monthlyFee: values.monthlyFee,
    currency: values.currency,
    billingEntity: values.billingEntity || undefined,
    startDate: values.startDate || undefined,
    contactName: values.contactName || undefined,
    billingEmail: values.billingEmail || undefined,
    phone: values.phone || undefined,
    address: values.address || undefined,
    secondaryEmail: values.secondaryEmail || undefined,
    adminContactName: values.adminContactName || undefined,
    adminContactEmail: values.adminContactEmail || undefined,
    adminContactPhone: values.adminContactPhone || undefined,
    paymentMethod: values.paymentMethod || undefined,
    discountPercentBp: values.discountPercent > 0
      ? Math.round(values.discountPercent * 100)
      : undefined,
    billingCycle: values.billingCycle || undefined,
    projectFee: values.projectFee > 0 ? values.projectFee : undefined,
    projectEndDate: values.projectEndDate || undefined,
  }
}

/** Persist a new client and return it in the front shape. */
export async function createClientViaApi(values: ClientFormValues): Promise<Client> {
  return dtoToClient(await clientsApi.create(toClientPayload(values)))
}

/** Persist an edit to a client (PUT /clients/:id). Sends only the entity fields the
 *  backend owns; the caller keeps the row's derived fields (payment status, team) by
 *  merging the form values locally, since the DTO does not carry them. */
export async function updateClientViaApi(id: string, values: ClientFormValues): Promise<void> {
  const input: UpdateClientInput = toClientPayload(values)
  await clientsApi.update(id, input)
}

/**
 * Persist a client's lifecycle status (`POST /clients/:id/status`).
 *
 * `status` is one of the few fields on this page the API actually models — most of what the row
 * shows (paid, due, invoice status, billing entity) is deliberate demo content the DTO does not
 * carry. So this is the one place where a local-only write was real data loss rather than
 * scaffolding: "Estado actualizado", reload, and the client is active again.
 *
 * Rejects on failure — the caller must not report success until this resolves.
 */
export async function setClientStatusViaApi(id: string, status: ClientStatus): Promise<void> {
  await clientsApi.setStatus(id, status)
}

/**
 * Delete a client (`DELETE /clients/:id`).
 *
 * Distinct from `setClientStatusViaApi(id, 'churned')`: a baja is a lifecycle status and the
 * client stays on the roster; this removes it from every read. The backend soft-deletes
 * (stamps `deletedAt`) so the client's receivables and assignments survive — from the front's
 * side the row is simply gone.
 *
 * Rejects on failure — the caller must not drop the row until this resolves.
 */
export async function deleteClientViaApi(id: string): Promise<void> {
  await clientsApi.remove(id)
}

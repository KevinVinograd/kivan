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

function toBillingEntity(raw: string | null): BillingEntity | undefined {
  return BILLING_ENTITIES.find((entity) => entity === raw)
}

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

export function toClientPayload(values: ClientFormValues): CreateClientInput {
  return {
    name: values.name,
    status: values.status,
    monthlyFeeMinor: String(Math.round(values.monthlyFee * 100)),
    currency: values.currency,
    services: values.services,
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

export async function createClientViaApi(values: ClientFormValues): Promise<Client> {
  return dtoToClient(await clientsApi.create(toClientPayload(values)))
}

export async function updateClientViaApi(id: string, values: ClientFormValues): Promise<void> {
  const input: UpdateClientInput = toClientPayload(values)
  await clientsApi.update(id, input)
}

export async function setClientStatusViaApi(id: string, status: ClientStatus): Promise<void> {
  await clientsApi.setStatus(id, status)
}

export async function deleteClientViaApi(id: string): Promise<void> {
  await clientsApi.remove(id)
}

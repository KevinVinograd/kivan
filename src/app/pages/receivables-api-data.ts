import {
  receivablesApi,
  type CreateReceivableInput,
  type ExchangeRateDto,
  type GenerateMonthlyFeesInput,
  type MonthlyFeeSkipReason,
  type ReceivableDto,
  type UpdateReceivableInput,
} from '@/api/receivables'
import type {
  BillingStatus,
  CollectionStatus,
  Receivable,
  ReceivableExtraItem,
} from './cobros-mock-data'
import { apiDateToCalendarDay } from '@/app/lib/iso-date'
import type { TaxProfileId } from './cobranza-format'

const majorToMinor = (major: number): string => String(Math.round(major * 100))

const TAX_PROFILES: readonly string[] = [
  'monotributo_1',
  'monotributo_2',
  'monotributo_3',
  'unassigned',
]

function asTaxProfile(code: string | null): TaxProfileId {
  return code && TAX_PROFILES.includes(code) ? (code as TaxProfileId) : 'unassigned'
}

const minorToMajor = (minor: string): number => Number(minor) / 100

export function dtoToReceivable(d: ReceivableDto): Receivable {
  return {
    id: d.id,
    clientId: d.clientId,
    clientName: d.clientName,
    businessName: d.businessName ?? undefined,
    taxId: d.taxId ?? undefined,
    contactName: d.contactName ?? undefined,
    invoiceNumber: d.invoiceNumber ?? undefined,
    period: d.period,
    service: d.service,
    baseAmount: minorToMajor(d.baseAmountMinor),
    extraAmount: minorToMajor(d.extraAmountMinor),
    extras: (d.extras ?? []).map((extra) => ({
      id: extra.id,
      description: extra.description,
      amount: minorToMajor(extra.amountMinor),
      billable: extra.billable,
    })),
    discountAmount: minorToMajor(d.discountAmountMinor),
    totalAmount: minorToMajor(d.totalAmountMinor),
    collectedAmount: minorToMajor(d.collectedAmountMinor),
    currency: d.currency,
    ...(d.originalCurrency && d.originalAmountMinor && d.fxRateMinor
      ? {
          originalCurrency: d.originalCurrency,
          originalAmount: minorToMajor(d.originalAmountMinor),
          fxRate: minorToMajor(d.fxRateMinor),
        }
      : {}),
    dueDate: d.dueDate,
    collectedAt: d.collectedAt ? apiDateToCalendarDay(d.collectedAt) : undefined,
    treasuryAccountId: d.treasuryAccountId ?? undefined,
    treasuryAccountName: d.treasuryAccountName ?? undefined,
    status: d.status as CollectionStatus,
    billingStatus: d.billingStatus as BillingStatus,
    taxProfileId: asTaxProfile(d.emitterCode),
    ...(d.invoiceIssuedAt ? { invoiceIssuedAt: apiDateToCalendarDay(d.invoiceIssuedAt) } : {}),
    cae: d.cae ?? undefined,
    emitterTaxProfile: d.emitterCode ? asTaxProfile(d.emitterCode) : undefined,
    lastActivityLabel: 'Sin actividad',
    lastActivityAt: d.createdAt,
    costs: {
      design: minorToMajor(d.costDesignMinor ?? '0'),
      comm: minorToMajor(d.costCommMinor ?? '0'),
      production: minorToMajor(d.costProductionMinor ?? '0'),
      viatics: minorToMajor(d.costViaticsMinor ?? '0'),
      pauta: minorToMajor(d.costPautaMinor ?? '0'),
      fixed: minorToMajor(d.costFixedMinor ?? '0'),
    },
  }
}

export async function fetchReceivables(): Promise<Receivable[]> {
  const LIMIT = 100
  const all: ReceivableDto[] = []
  for (let offset = 0; ; offset += LIMIT) {
    const res = await receivablesApi.list({ limit: LIMIT, offset })
    all.push(...res.items)
    if (all.length >= res.total || res.items.length < LIMIT) break
  }
  return all.map(dtoToReceivable)
}

export interface CreateCobroInput {
  clientId: string
  period: string
  service: string
  baseAmount: number
  extraAmount: number
  discountAmount: number
  dueDate: string
}

export async function createReceivableViaApi(input: CreateCobroInput): Promise<Receivable> {
  const body: CreateReceivableInput = {
    clientId: input.clientId,
    period: input.period,
    service: input.service,
    baseAmountMinor: majorToMinor(input.baseAmount),
    extraAmountMinor: majorToMinor(input.extraAmount),
    discountAmountMinor: majorToMinor(input.discountAmount),
    dueDate: input.dueDate,
  }
  return dtoToReceivable(await receivablesApi.create(body))
}

export interface UpdateCobroInput {
  service?: string
  baseAmount?: number
  extraAmount?: number
  discountAmount?: number
  dueDate?: string
  extras?: ReceivableExtraItem[]
  costs?: {
    pauta: number
    fixed: number
  }
}

export function extrasTotal(extras: ReceivableExtraItem[]): number {
  return extras.reduce((sum, extra) => sum + extra.amount, 0)
}

export async function updateReceivableViaApi(
  id: string,
  input: UpdateCobroInput,
): Promise<Receivable> {
  const body: UpdateReceivableInput = {}
  if (input.service !== undefined) body.service = input.service
  if (input.baseAmount !== undefined) body.baseAmountMinor = majorToMinor(input.baseAmount)
  if (input.discountAmount !== undefined) {
    body.discountAmountMinor = majorToMinor(input.discountAmount)
  }
  if (input.dueDate !== undefined) body.dueDate = input.dueDate
  if (input.costs !== undefined) {
    body.costPautaMinor = majorToMinor(input.costs.pauta)
    body.costFixedMinor = majorToMinor(input.costs.fixed)
  }
  if (input.extras !== undefined) {
    body.extras = input.extras.map((extra) => ({
      ...(extra.id ? { id: extra.id } : {}),
      description: extra.description,
      amountMinor: majorToMinor(extra.amount),
      billable: extra.billable,
    }))
    body.extraAmountMinor = majorToMinor(input.extraAmount ?? extrasTotal(input.extras))
  } else if (input.extraAmount !== undefined) {
    body.extraAmountMinor = majorToMinor(input.extraAmount)
  }
  return dtoToReceivable(await receivablesApi.update(id, body))
}

export async function collectReceivableViaApi(
  id: string,
  amount: number,
  collectedAt?: string,
  treasuryAccountId?: string,
): Promise<Receivable> {
  const key = crypto.randomUUID()
  return dtoToReceivable(
    await receivablesApi.collect(id, majorToMinor(amount), key, collectedAt, treasuryAccountId),
  )
}

export async function generateInvoiceViaApi(id: string, emitterId: string): Promise<Receivable> {
  return dtoToReceivable(await receivablesApi.generateInvoice(id, emitterId))
}

export async function associateInvoiceViaApi(
  id: string,
  invoiceNumber: string,
  issuedAt: string,
): Promise<Receivable> {
  return dtoToReceivable(await receivablesApi.associateInvoice(id, invoiceNumber, issuedAt))
}

export async function markInvoiceSentViaApi(id: string): Promise<Receivable> {
  return dtoToReceivable(await receivablesApi.markInvoiceSent(id))
}

export async function cancelReceivableViaApi(id: string): Promise<Receivable> {
  return dtoToReceivable(await receivablesApi.cancel(id))
}

export interface MonthlyFeeCandidate {
  clientId: string
  clientName: string
  services: string[]
  suggestedService: string | null
  monthlyFee: number
  currency: string
  convertedArs: number | null
  discountPercent: number | null
  discountAmount: number | null
  lines: { id: string; name: string; price: number }[] | null
  productions: { id: string; date: string; title: string; serviceName: string; amount: number }[]
  arsPerUsd: number | null
  skipReason: MonthlyFeeSkipReason | null
  manualServices: string[]
}

export interface MonthlyExchangeRate {
  period: string
  arsPerUsd: number
  updatedAt: string
}

export interface MonthlyFeePreview {
  items: MonthlyFeeCandidate[]
  withoutFee: string[]
  exchangeRate: MonthlyExchangeRate | null
}

export async function fetchMonthlyFeePreview(period: string): Promise<MonthlyFeePreview> {
  const res = await receivablesApi.monthlyFeePreview(period)
  return {
    items: res.items.map((item) => ({
      clientId: item.clientId,
      clientName: item.clientName,
      services: item.services,
      suggestedService: item.suggestedService,
      monthlyFee: minorToMajor(item.monthlyFeeMinor),
      currency: item.currency,
      convertedArs: item.convertedArsMinor ? minorToMajor(item.convertedArsMinor) : null,
      discountPercent: item.discountPercentBp ? item.discountPercentBp / 100 : null,
      discountAmount: item.discountAmountMinor ? minorToMajor(item.discountAmountMinor) : null,
      lines:
        item.lines?.map((l) => ({ id: l.id, name: l.name, price: minorToMajor(l.priceMinor) })) ??
        null,
      productions: (item.productions ?? []).map((p) => ({
        id: p.id,
        date: p.date,
        title: p.title,
        serviceName: p.serviceName,
        amount: minorToMajor(p.amountMinor),
      })),
      arsPerUsd: res.exchangeRate ? minorToMajor(res.exchangeRate.arsPerUsdMinor) : null,
      skipReason: item.skipReason,
      manualServices: item.manualServices ?? [],
    })),
    withoutFee: res.withoutFee ?? [],
    exchangeRate: res.exchangeRate ? toMonthlyExchangeRate(res.exchangeRate) : null,
  }
}

function toMonthlyExchangeRate(dto: ExchangeRateDto): MonthlyExchangeRate {
  return {
    period: dto.period,
    arsPerUsd: minorToMajor(dto.arsPerUsdMinor),
    updatedAt: dto.updatedAt,
  }
}

export async function setMonthlyExchangeRateViaApi(
  period: string,
  arsPerUsd: number,
): Promise<MonthlyExchangeRate> {
  const dto = await receivablesApi.setExchangeRate({
    period,
    arsPerUsdMinor: majorToMinor(arsPerUsd),
  })
  return toMonthlyExchangeRate(dto)
}

export interface MonthlyFeeGenerationResult {
  created: Receivable[]
  skipped: { clientId: string; clientName: string; reason: MonthlyFeeSkipReason }[]
}

export async function generateMonthlyFeesViaApi(
  input: GenerateMonthlyFeesInput,
): Promise<MonthlyFeeGenerationResult> {
  const res = await receivablesApi.generateMonthlyFees(input)
  return { created: res.created.map(dtoToReceivable), skipped: res.skipped }
}

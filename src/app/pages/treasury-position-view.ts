import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'

import type { Account, CommittedItem, Currency, Money } from './treasury-mock-data'
import type { SettlementMovement } from './treasury-api-data'
import type { Receivable } from './cobros-mock-data'
import type { Payment } from './pagos-mock-data'
import type { PendingPayout } from './treasury-pending-payouts'
import { paymentEntity, type EntityRef } from './treasury-format'
import {
  addMoney,
  CURRENCIES,
  operatingAccounts,
  outstandingAmount,
  positionByLane,
  reserveAccounts,
  reserveByLane,
  saldosByLane,
  sumMoney,
} from './treasury-position'

export const LANE_LABEL: Record<Currency, string> = { ARS: 'ARS', USD: 'USD' }

export const PARTNER_LABEL: Record<Account['partner'], string> = {
  vicky: 'Vicky',
  flor: 'Flor',
  more: 'More',
  shared: 'Compartida',
}

export const ACCOUNT_TYPE_LABEL: Record<Account['type'], string> = {
  bank: 'Banco',
  cash: 'Efectivo',
  investment: 'Inversión',
}

const ARS_FORMAT = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
const USD_FORMAT = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

const ARS_COMPACT = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', notation: 'compact', maximumFractionDigits: 1 })
const USD_COMPACT = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 })

export function formatLaneAmount(amount: number, currency: Currency): string {
  switch (currency) {
    case 'ARS':
      return ARS_FORMAT.format(amount)
    case 'USD':
      return USD_FORMAT.format(amount)
  }
}

export function formatCompactLaneAmount(amount: number, currency: Currency): string {
  switch (currency) {
    case 'ARS':
      return ARS_COMPACT.format(amount)
    case 'USD':
      return USD_COMPACT.format(amount)
  }
}

export function rowLane(balances: Money): Currency | undefined {
  return CURRENCIES.find((currency) => balances[currency] != null)
}

function shortDate(iso: string): string {
  return format(parseISO(iso), 'd LLL', { locale: es })
}

export type PositionInstallment = { dateLabel: string; amount: number; note?: string }

export type PositionRow = {
  id: string
  label: string
  detail?: string
  balances: Money
  installments?: PositionInstallment[]
  reimbursement?: { amount: number; note?: string }
  observations?: string
}

export type PositionSection = {
  rows: PositionRow[]
  total: Money
}

export type PositionModel = {
  asOfLabel: string
  saldos: PositionSection
  ingresosPendientes: PositionSection
  egresosPendientes: PositionSection
  saldosMasACobrar: Money
  posicion: Money
  reserva: PositionSection
  patrimonio: Money
}

function receivableOutstanding(receivable: Receivable): number {
  return receivable.status === 'cancelled' ? 0 : Math.max(receivable.totalAmount - receivable.collectedAmount, 0)
}

function paymentOutstanding(payment: Payment): number {
  return payment.status === 'cancelled' ? 0 : Math.max(payment.totalAmount - payment.paidAmount, 0)
}

type AutoEntry = { name: string; amount: number; date: string; currency: Currency }

function aggregateByName(entries: AutoEntry[]): AutoEntry[] {
  const byName = new Map<string, AutoEntry>()
  for (const entry of entries) {
    const key = `${entry.currency}|${entry.name}`
    const existing = byName.get(key)
    if (!existing) {
      byName.set(key, { ...entry })
    } else {
      existing.amount += entry.amount
      if (entry.date < existing.date) existing.date = entry.date
    }
  }
  return [...byName.values()].sort((a, b) => b.amount - a.amount)
}

type ActualPool = Map<string, number>

function poolKey(entity: EntityRef, currency: Currency): string {
  return `${currency}|${entity.type}|${entity.id}`
}

function addToPool(
  pool: ActualPool,
  entity: EntityRef | undefined,
  currency: Currency,
  amount: number,
): void {
  if (!entity || amount <= 0) return
  const key = poolKey(entity, currency)
  pool.set(key, (pool.get(key) ?? 0) + amount)
}

function netAgainstPool(item: CommittedItem, remaining: number, pool: ActualPool): number {
  if (!item.linkedEntityType || !item.linkedEntityId) return remaining
  const key = poolKey({ type: item.linkedEntityType, id: item.linkedEntityId }, item.currency)
  const available = pool.get(key) ?? 0
  if (available <= 0) return remaining
  const taken = Math.min(available, remaining)
  pool.set(key, available - taken)
  return remaining - taken
}

function manualPendienteRows(
  commitments: CommittedItem[],
  direction: 'inflow' | 'outflow',
  pool: ActualPool,
): PositionRow[] {
  return commitments
    .filter((item) => item.isActive && item.source === 'manual' && item.direction === direction)
    .sort((a, b) => Number(Boolean(b.linkedEntityId)) - Number(Boolean(a.linkedEntityId)))
    .map((item) => ({ item, remaining: netAgainstPool(item, outstandingAmount(item), pool) }))
    .filter(({ remaining, item }) => remaining > 0 || item.reimbursement != null)
    .map(({ item, remaining }) => ({
      id: item.id,
      label: item.description,
      detail: shortDate(item.startDate),
      balances: { [item.currency]: remaining } as Money,
      installments: item.installments?.map((installment) => ({
        dateLabel: shortDate(installment.date),
        amount: installment.amount,
        note: installment.note,
      })),
      reimbursement: item.reimbursement
        ? { amount: item.reimbursement.amount, note: item.reimbursement.note }
        : undefined,
      observations: item.observations,
    }))
}

function movementNote(accountId: string, movements: SettlementMovement[]): string | undefined {
  const mine = movements.filter((m) => m.accountId === accountId)
  if (mine.length === 0) return undefined
  const parts: string[] = []
  for (const lane of CURRENCIES) {
    const inLane = mine.filter((m) => m.lane === lane)
    if (inLane.length === 0) continue
    const inflow = inLane
      .filter((m) => m.direction === 'inflow')
      .reduce((sum, m) => sum + m.amount, 0)
    const outflow = inLane
      .filter((m) => m.direction === 'outflow')
      .reduce((sum, m) => sum + m.amount, 0)
    if (inflow > 0) parts.push(`+${formatLaneAmount(inflow, lane)} en cobros`)
    if (outflow > 0) parts.push(`-${formatLaneAmount(outflow, lane)} en pagos`)
  }
  return parts.length > 0 ? `${parts.join(' · ')} desde la fecha de la posición` : undefined
}

function saldosSection(accounts: Account[], movements: SettlementMovement[]): PositionSection {
  const rows = operatingAccounts(accounts).map((account) => {
    const moved = movementNote(account.id, movements)
    return {
      id: account.id,
      label: account.name,
      detail: PARTNER_LABEL[account.partner],
      balances: account.balances,
      observations: [account.note?.trim() || undefined, moved].filter(Boolean).join(' · ') || undefined,
    }
  })
  return { rows, total: saldosByLane(accounts) }
}

function reservaSection(accounts: Account[]): PositionSection {
  const rows = reserveAccounts(accounts).map((account) => ({
    id: account.id,
    label: account.name,
    detail: ACCOUNT_TYPE_LABEL[account.type],
    balances: account.balances,
    observations: account.note,
  }))
  return { rows, total: reserveByLane(accounts) }
}

function ingresosSection(receivables: Receivable[], commitments: CommittedItem[]): PositionSection {
  const autoRows: PositionRow[] = aggregateByName(
    receivables
      .map((receivable) => ({
        name: receivable.clientName,
        amount: receivableOutstanding(receivable),
        date: receivable.dueDate,
        currency: receivable.currency,
      }))
      .filter((entry) => entry.amount > 0),
  ).map((entry) => ({
    id: `rec-${entry.currency}-${entry.name}`,
    label: entry.name,
    detail: shortDate(entry.date),
    balances: { [entry.currency]: entry.amount } as Money,
  }))
  const pool: ActualPool = new Map()
  for (const r of receivables) {
    if (r.clientId) {
      addToPool(pool, { type: 'client', id: r.clientId }, r.currency, receivableOutstanding(r))
    }
  }
  const rows = [...autoRows, ...manualPendienteRows(commitments, 'inflow', pool)]
  return { rows, total: sumMoney(rows.map((row) => row.balances)) }
}

function egresosSection(
  payments: Payment[],
  commitments: CommittedItem[],
  payouts: PendingPayout[],
): PositionSection {
  const autoRows: PositionRow[] = aggregateByName(
    payments
      .map((payment) => ({
        name: payment.recipientName,
        amount: paymentOutstanding(payment),
        date: payment.expectedDate,
        currency: payment.currency,
      }))
      .filter((entry) => entry.amount > 0),
  ).map((entry) => ({
    id: `pay-${entry.currency}-${entry.name}`,
    label: entry.name,
    detail: shortDate(entry.date),
    balances: { [entry.currency]: entry.amount } as Money,
  }))
  const payoutRows: PositionRow[] = payouts.map((p) => ({
    id: p.id,
    label: p.label,
    detail: shortDate(p.date),
    balances: { ARS: p.amount },
  }))
  const pool: ActualPool = new Map()
  for (const p of payments) addToPool(pool, paymentEntity(p), p.currency, paymentOutstanding(p))
  for (const p of payouts) {
    addToPool(pool, { type: 'teamMember', id: p.teamMemberId }, 'ARS', p.amount)
  }
  const rows = [...autoRows, ...payoutRows, ...manualPendienteRows(commitments, 'outflow', pool)]
  return { rows, total: sumMoney(rows.map((row) => row.balances)) }
}

export type BuildPositionInput = {
  accounts: Account[]
  receivables: Receivable[]
  payments: Payment[]
  commitments: CommittedItem[]
  payouts?: PendingPayout[]
  asOfISO: string
  // Already included in accounts[].balances: never add these to a total.
  movements?: SettlementMovement[]
}

export function buildPositionModel(input: BuildPositionInput): PositionModel {
  const { accounts, receivables, payments, commitments, asOfISO } = input
  const saldos = saldosSection(accounts, input.movements ?? [])
  const ingresosPendientes = ingresosSection(receivables, commitments)
  const egresosPendientes = egresosSection(payments, commitments, input.payouts ?? [])
  const reserva = reservaSection(accounts)
  const posicion = positionByLane(saldos.total, ingresosPendientes.total, egresosPendientes.total)
  return {
    asOfLabel: format(parseISO(asOfISO), "d 'de' LLLL 'de' yyyy", { locale: es }),
    saldos,
    ingresosPendientes,
    egresosPendientes,
    saldosMasACobrar: addMoney(saldos.total, ingresosPendientes.total),
    posicion,
    reserva,
    patrimonio: addMoney(reserva.total, posicion),
  }
}

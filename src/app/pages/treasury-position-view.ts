/**
 * Posición view-model (pure). Assembles the account administrator's position
 * snapshot — Saldos, Ingresos/Egresos pendientes, Posición, and Finanzas Hold /
 * Reserva — from the treasury accounts, the canonical cobros/pagos outstanding,
 * and the manual committed-items register. No React, no I/O: lane-aware money
 * formatting + section assembly only, so it is unit-tested in the node `unit`
 * project. Currency lanes (ARS / USD) are kept side by side and never
 * converted into each other, exactly as the source sheet does.
 */
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

/** Column header for each currency lane. */
export const LANE_LABEL: Record<Currency, string> = { ARS: 'ARS', USD: 'USD' }

/** Display label for an account's partner. */
export const PARTNER_LABEL: Record<Account['partner'], string> = {
  vicky: 'Vicky',
  flor: 'Flor',
  more: 'More',
  shared: 'Compartida',
}

/** Display label for an account's type. */
export const ACCOUNT_TYPE_LABEL: Record<Account['type'], string> = {
  bank: 'Banco',
  cash: 'Efectivo',
  investment: 'Inversión',
}

const ARS_FORMAT = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
const USD_FORMAT = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

const ARS_COMPACT = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', notation: 'compact', maximumFractionDigits: 1 })
const USD_COMPACT = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 })

/**
 * Format a single-lane amount with its own currency symbol. The amount is never
 * expressed in a converted currency: each lane is shown in the money it is in.
 *
 * EXHAUSTIVE ON PURPOSE — no `default`. Every lane that reaches here comes from
 * `CURRENCIES`, which is `LANES`, which is derived from an exhaustiveness-checked
 * `Record<Currency, string>`; a lane the API sends but the front does not know never gets
 * this far, because `sumMoney` and `LaneCells` iterate that same array. So a `default`
 * would be unreachable, and it would cost the thing that makes this safe: with no
 * fallthrough, adding a lane to the shared enum fails `tsc` right here and someone has to
 * give it a symbol. A default that printed a bare code-prefixed number instead would
 * compile, ship, and read as a deliberate choice.
 *
 * (An unknown lane IS reachable one level up — `treasury-api-data.ts` casts a DTO field
 * typed `string`, and Deploy Web ships before Deploy API. What happens to it is decided
 * there and in `cashflow-position.tsx`, not here: `sumMoney` and `LaneCells` iterate the
 * known lanes, so its amount is left out of the totals and its cells read as dashes, and
 * `PositionRowView` omits the sub-lines rather than printing them in a lane it cannot
 * name. A default here would put a plausible figure on the screen instead, which is the
 * opposite of what those two do.)
 */
export function formatLaneAmount(amount: number, currency: Currency): string {
  switch (currency) {
    case 'ARS':
      return ARS_FORMAT.format(amount)
    case 'USD':
      return USD_FORMAT.format(amount)
  }
}

/** Compact lane formatting for dense charts / matrix cells (e.g. "$12,4 M"). Exhaustive
 *  for the same reason as `formatLaneAmount`. */
export function formatCompactLaneAmount(amount: number, currency: Currency): string {
  switch (currency) {
    case 'ARS':
      return ARS_COMPACT.format(amount)
    case 'USD':
      return USD_COMPACT.format(amount)
  }
}

/**
 * The lane a row's sub-lines are denominated in — its installments and its reintegro —
 * or `undefined` when the row's money is in a lane this build does not know.
 *
 * It lives HERE, in the unit-tested module, rather than inline in `PositionRowView`. It
 * used to be `CURRENCIES.find(...) ?? 'ARS'` in the component, and that fallback printed a
 * foreign lane's sub-lines under a peso "$" while both lane cells showed a dash. Nothing
 * could catch it: no test mounts that component, so restoring the fallback would leave the
 * whole suite green. As a function it is a rule with a test, not a default with a comment.
 */
export function rowLane(balances: Money): Currency | undefined {
  return CURRENCIES.find((currency) => balances[currency] != null)
}

/** Short "d LLL" day label for a pendiente's date (e.g. "23 jun"). */
function shortDate(iso: string): string {
  return format(parseISO(iso), 'd LLL', { locale: es })
}

export type PositionInstallment = { dateLabel: string; amount: number; note?: string }

export type PositionRow = {
  id: string
  /** UI label: account name, client, recipient, or concept. */
  label: string
  /** Secondary context: partner, account type, or due date. */
  detail?: string
  /** The row's amounts, per currency lane. */
  balances: Money
  /** Dated partial settlements ("a cuenta"), for salary pendientes. */
  installments?: PositionInstallment[]
  /** A reintegro still owed against the row. */
  reimbursement?: { amount: number; note?: string }
  /** Free-form observation (UI copy, Spanish). */
  observations?: string
}

export type PositionSection = {
  rows: PositionRow[]
  /** Per-lane total of the section's rows. */
  total: Money
}

export type PositionModel = {
  /** Anchor date label (e.g. "22 de junio de 2026"). */
  asOfLabel: string
  saldos: PositionSection
  ingresosPendientes: PositionSection
  egresosPendientes: PositionSection
  /** Saldos + a cobrar, per lane. */
  saldosMasACobrar: Money
  /** Saldos + a cobrar - a pagar, per lane. */
  posicion: Money
  reserva: PositionSection
  /** Reserva + Posición, per lane (total wealth / Finanzas Hold). */
  patrimonio: Money
}

function receivableOutstanding(receivable: Receivable): number {
  return receivable.status === 'cancelled' ? 0 : Math.max(receivable.totalAmount - receivable.collectedAmount, 0)
}

function paymentOutstanding(payment: Payment): number {
  return payment.status === 'cancelled' ? 0 : Math.max(payment.totalAmount - payment.paidAmount, 0)
}

type AutoEntry = { name: string; amount: number; date: string; currency: Currency }

/** Collapse per-record outstanding amounts into one row per counterparty AND LANE (sum
 *  amounts, keep the earliest date), matching the sheet's one-row-per-name layout.
 *
 *  Grouped by lane as well as name because the Posición keeps lanes side by side and never
 *  converts between them: one counterparty owed pesos and dollars is two rows, and merging
 *  them would put dollars into the peso column. */
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

/**
 * What the counterparties named here ALREADY owe, or are already owed, as recorded money.
 *
 * The Posición summed three independent sources — the canonical cobros/pagos, the team's
 * liquidaciones, and the manual register — so a commitment and the record that realizes it
 * were both counted. "Sueldos" planned in the register plus Ana's liquidación is one
 * month's payroll reported as two.
 *
 * The projection has solved this for a long time and this is the same idea in a snapshot:
 * a commitment is an EXPECTATION, and money already on the books for that same
 * counterparty is that expectation, recorded. Netted by amount and consumed, so two
 * commitments on one counterparty cannot both claim the same pesos.
 */
type ActualPool = Map<string, number>

// The LANE rides in the key. Without it a pago in dollars consumes a commitment written
// in pesos for the same counterparty, so a peso expectation disappears from the Posición
// because dollars were paid against something else entirely.
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

/**
 * What this commitment still expects after taking its share of the pool.
 *
 * IDENTITY ONLY — no category fallback, and this is the one place the Posición must
 * differ from the projection. There, a coarse `direction|category` match is bounded by the
 * occurrence's own recurrence window; a snapshot has no window at all, so an unbounded
 * category match would let one large pending pago erase every unlinked commitment of that
 * category. That is the "one 5.000 payment erased a 3.000.000 payroll" failure the netting
 * engine already paid for once, and it is worse here because nothing dates it.
 *
 * So an UNLINKED commitment keeps counting in full. New sueldos and abonos must name a
 * counterparty (`entityLinkRequired`), so this is precise on new data and merely
 * unchanged on the rows filed before the link existed.
 */
function netAgainstPool(item: CommittedItem, remaining: number, pool: ActualPool): number {
  if (!item.linkedEntityType || !item.linkedEntityId) return remaining
  const key = poolKey({ type: item.linkedEntityType, id: item.linkedEntityId }, item.currency)
  const available = pool.get(key) ?? 0
  if (available <= 0) return remaining
  const taken = Math.min(available, remaining)
  pool.set(key, available - taken)
  return remaining - taken
}

/** Manual register pendientes (any currency lane), net of "a cuenta" installments. */
function manualPendienteRows(
  commitments: CommittedItem[],
  direction: 'inflow' | 'outflow',
  pool: ActualPool,
): PositionRow[] {
  return commitments
    .filter((item) => item.isActive && item.source === 'manual' && item.direction === direction)
    // LINKED first, so the specific claim beats the generic one and the answer stops
    // depending on the order the store happened to return rows in — the same ordering the
    // projection needs for the same reason.
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

/**
 * The net a settlement moved an account by, since the anchor — as UI copy, or undefined
 * when nothing moved it.
 *
 * This is the line that answers "¿por qué cambió el saldo que cargué?". Balances used to
 * be purely manual, so any change was something a person did; now a cobro or a pago moves
 * them on its own, and a figure that changes for invisible reasons is worse than one that
 * does not change at all.
 */
function movementNote(accountId: string, movements: SettlementMovement[]): string | undefined {
  const mine = movements.filter((m) => m.accountId === accountId)
  if (mine.length === 0) return undefined
  // Per lane, not ARS-only. A USD settlement moves balanceUsdMinor and the USD Saldos
  // total visibly rises with it; filtering the note to pesos left that change unexplained,
  // which is the very failure this line exists to prevent — one lane over.
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
    // `formatLaneAmount` (this file, above) carries the lane's own unit, so the figure
    // no longer needs a trailing code — and no longer contradicts itself. It used to
    // read `+$ 5.000 USD en cobros`: the peso symbol and the dollar tag on one number,
    // the tag correcting a symbol that should not have been there.
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
      // BOTH, when there are both. The operator's note was typed deliberately and must
      // not be displaced — but letting it displace the provenance line meant the only
      // explanation of a self-changing balance was withheld from exactly the accounts
      // someone cared enough to annotate. `.trim()` because an empty note is not a note.
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
    // The lane is in the id as well as the amount: two rows for one client in two lanes
    // are two rows, and a shared id would collapse them in React.
    id: `rec-${entry.currency}-${entry.name}`,
    label: entry.name,
    detail: shortDate(entry.date),
    balances: { [entry.currency]: entry.amount } as Money,
  }))
  // The income side has the same overlap as the outflow one: an abono in the register and
  // the client's own outstanding cobro are one month's fee counted twice.
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
  // Payroll. Kept as its OWN rows rather than folded into `aggregateByName` above: a
  // liquidación and a pago to the same person are two different records, and merging them
  // under one name would hide which of the two is unpaid. A statement is ARS by
  // construction — `PayoutStatement` carries no currency column.
  const payoutRows: PositionRow[] = payouts.map((p) => ({
    id: p.id,
    label: p.label,
    detail: shortDate(p.date),
    balances: { ARS: p.amount },
  }))
  // Both sources of already-recorded money out: an outstanding pago and an unpaid
  // liquidación are equally "this counterparty is already owed", so a commitment naming
  // that counterparty is the same money planned.
  const pool: ActualPool = new Map()
  for (const p of payments) addToPool(pool, paymentEntity(p), p.currency, paymentOutstanding(p))
  for (const p of payouts) {
    // ARS by construction, like the row above: `PayoutStatement` carries no currency
    // column, so a liquidación in another lane is not representable yet.
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
  /**
   * The payroll still owed, across every period. Optional so a caller that has not
   * fetched it renders the section it always rendered — but the Cashflow page DOES
   * fetch it, because a Posición that omits payroll overstates what the studio has.
   */
  payouts?: PendingPayout[]
  /** ISO 'YYYY-MM-DD' anchor date for the snapshot. */
  asOfISO: string
  /**
   * Automatic balance movements since the anchor. PROVENANCE ONLY — they are already
   * inside `accounts[].balances`, so they annotate the Saldos rows and are NEVER added
   * to any total. Adding them is double counting, and it is exactly the mistake that
   * made a previous version of this screen report money the studio did not have.
   */
  movements?: SettlementMovement[]
}

/** Assemble the full Posición snapshot model from the live stores. */
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

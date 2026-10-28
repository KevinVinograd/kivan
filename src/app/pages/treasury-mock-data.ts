/**
 * Treasury (cashflow) mock data — accounts, opening balance, and the
 * committed-items register.
 *
 * No backend: an in-memory set of treasury accounts (per partner, per currency
 * lane), the legacy single opening-balance anchor the projection engine still
 * consumes, and a hand-authored set of recurring/committed money movements that
 * `treasury-format.ts` rolls forward across a 13-week window. The multi-account /
 * multi-currency model (`Account`, `Currency`, `Money`) mirrors the account
 * administrator's real position sheet; the forward projection engine stays on the
 * ARS lane until the multi-currency milestone (M7) generalizes it.
 */

/** Cashflow line category for committed items (and the projection breakdown). */
export type CommittedCategory =
  | 'salaries'
  | 'fixed_expense'
  | 'tax'
  | 'platform'
  | 'retainer'
  | 'other'

/**
 * Treasury currency lanes. A fund account (Fondo Común de Inversión) is an ACCOUNT of
 * type `investment` holding pesos, not a lane; lanes are never converted into each other
 * — the position sheet shows a column per lane, exactly as the administrator does.
 *
 * RE-EXPORTED from the shared enum rather than declared again. This module used to
 * spell the union out, so the treasury's money types and the API contract were two
 * separate lists that happened to agree — and a lane added to one compiled cleanly
 * against the other until something crossed the boundary. The eleven modules importing
 * `Currency` from here keep working; they now get the one definition.
 */
export type { Currency } from '@hold/shared'
import type { Currency } from '@hold/shared'

/** The Hold partners money is tracked per; `shared` for jointly-held accounts. */
export type Partner = 'vicky' | 'flor' | 'more' | 'shared'

/** An amount spread across currency lanes; an omitted lane reads as 0. */
export type Money = Partial<Record<Currency, number>>

/**
 * A treasury account: a bank account, a cash box, or an investment bucket, held
 * by a partner. Balances are manually entered per lane (no bank integration), and
 * reserve accounts roll up into the consolidated Finanzas Hold position.
 */
export type Account = {
  id: string
  /** UI copy (Spanish), e.g. "Banco Vicky", "FIMA Fondo Común". */
  name: string
  partner: Partner
  type: 'bank' | 'cash' | 'investment'
  /** Manually entered balances, per currency lane. */
  balances: Money
  /** Counts toward the consolidated reserve / Finanzas Hold position. */
  isReserve?: boolean
  /** Optional per-account observation (UI copy, Spanish), shown in the Saldos "Obs." column. */
  note?: string
  isActive: boolean
  /** Optimistic-concurrency token from the API (absent for mock/unsaved rows). */
  version?: number
}

/** The opening-balance anchor. v1 uses exactly one active account. */
export type CashAccount = {
  id: string
  /** UI copy (Spanish) e.g. "Caja principal". */
  name: string
  /** The lane this projection runs in. Pinned to the literal until the day a pago could
   *  be recorded in another one; `projectCashflow` takes the lane from its own
   *  `currency` input, so this field constrains nothing and must not pretend to. */
  currency: Currency
  /** Reconciled cash on hand at openingBalanceDate. */
  openingBalance: number
  /** ISO 'YYYY-MM-DD' — the as-of anchor for week 0. */
  openingBalanceDate: string
  isActive: boolean
}

/** A dated partial settlement of a committed item (a salary paid "a cuenta"). */
export type Installment = {
  /** ISO 'YYYY-MM-DD'. */
  date: string
  amount: number
  /** UI copy (Spanish) — optional note ("a cuenta", "reintegro a realizar"). */
  note?: string
}

/** A reintegro (reimbursement) owed against a committed item. */
export type Reimbursement = {
  amount: number
  /** Which partner owes or settles the reintegro. */
  owedBy?: Partner
  /** UI copy (Spanish). */
  note?: string
}

/** A committed or projected future money movement (the forward register). */
/**
 * The kinds of entity a commitment may name. Each one is a table whose money
 * records already carry the same id, which is what makes identity matching
 * possible at all.
 */
export type LinkedEntityType = 'client' | 'teamMember' | 'provider' | 'invoiceEmitter'

/**
 * Which entity kind a commitment can name, given BOTH its category and its direction.
 *
 * Direction is not decoration here: the netting pool is keyed on it, so a client link on
 * an OUTFLOW commitment can never match anything (a client's money is always an inflow)
 * and a provider link on an inflow is equally dead. The dialog lets category and direction
 * be set independently, so without this pair check it happily saved links that looked
 * correct in the register and silently netted nothing.
 *
 * `undefined` for every other pair, including the three categories with no counterparty
 * record at all (fixed_expense, tax, platform).
 */
export function entityTypeFor(
  category: CommittedCategory,
  direction: CommittedItem['direction'],
): LinkedEntityType | undefined {
  if (category === 'retainer' && direction === 'inflow') return 'client'
  if (category === 'salaries' && direction === 'outflow') return 'teamMember'
  if (direction !== 'outflow') return undefined
  // The monotributo cuota belongs to an EMITTER, not to a provider. A workspace runs up
  // to three emisores with their own monthly and annual limits, and an AFIP-shaped
  // provider would collapse them into one — letting one monotributista's cuota net
  // against another's, which is precision lost exactly where the limits live.
  if (category === 'tax') return 'invoiceEmitter'
  // A gasto fijo and a plataforma DO have someone they are paid to: the landlord, the
  // subscription. They needed no new modeling — `Payment.providerId` already existed and
  // the pago simply never offered it for those recipient types. What was missing was a
  // counterparty to name, not a column to name it in. (The earlier note here said a
  // durable "el alquiler" concept was required; it is not, because the money side never
  // pointed at the expense either — it pointed at whoever was paid.)
  if (category === 'fixed_expense' || category === 'platform' || category === 'other') {
    return 'provider'
  }
  return undefined
}

/**
 * Is naming the counterparty REQUIRED to file a new commitment of this kind?
 *
 * Only where the category IS the counterparty kind, which is to say: only the two whose
 * counterparty is definitionally present. An abono is a client's and a sueldo is a
 * colaboradora's; there is no such thing as either without one.
 *
 * Everything provider-anchored stays OPTIONAL, `other` and the two categories that joined
 * it. `other` is the codebase's catch-all — `dtoToCommitment` routes every category it
 * does not recognize there — so demanding a provider would block a bank fee. And a gasto
 * fijo or a plataforma genuinely may have nobody to name: a studio that has not loaded
 * its landlord as a proveedor must still be able to file the rent. Attaching an unrelated
 * provider to make the form submit would create a live netting key against that
 * provider's real pagos, which is worse than no link at all.
 *
 * The monotributo is optional for the same reason: the cuota is real whether or not the
 * emisores have been configured.
 */
export function entityLinkRequired(
  category: CommittedCategory,
  direction: CommittedItem['direction'],
): boolean {
  const type = entityTypeFor(category, direction)
  return type === 'client' || type === 'teamMember'
}

export type CommittedItem = {
  id: string
  /** UI copy (Spanish). */
  description: string
  direction: 'inflow' | 'outflow'
  amount: number
  currency: Currency
  category: CommittedCategory
  recurrence: 'monthly' | 'quarterly' | 'annual' | 'one_time'
  /** ISO — first occurrence. */
  startDate: string
  /** ISO — commitment horizon; open-ended within the window if absent. */
  endDate?: string
  /** Day of month (1–28) the item lands on, used to bucket into the right week. */
  anchorDay: number
  confidence: 'committed' | 'projected'
  source: 'derived' | 'manual'
  /**
   * The entity this commitment realizes, so the projection can supersede it by
   * IDENTITY rather than by guessing from (week, direction, category).
   *
   * Only the three kinds whose ACTUALS carry a matching id are linkable:
   * `Receivable.clientId`, `Payment.teamMemberId`, `Payment.providerId`. A gasto
   * fijo, a monotributo cuota and a plataforma have no counterparty record to point
   * at, so a commitment in those categories stays unlinked by design.
   *
   * Unlinked does NOT mean unnetted. The occurrence still nets, on the coarser
   * `direction|category` key (`treasury-netting.ts`), which can attribute the wrong
   * record but never counts the same money twice. Reading absence of a link as
   * "projects in full" is the claim that shipped a workspace-wide double-count once.
   *
   * The two fields are one fact and travel together.
   */
  linkedEntityType?: LinkedEntityType
  linkedEntityId?: string
  /** Dated partial settlements ("a cuenta"), e.g. salaries paid in installments. */
  installments?: Installment[]
  /** A reintegro owed against this item (mirrors the sheet's reimbursement rows). */
  reimbursement?: Reimbursement
  /** Free-form observations mirrored from the administrator's sheet (UI copy, Spanish). */
  observations?: string
  isActive: boolean
  /** Optimistic-concurrency token from the API (absent for mock/unsaved rows). */
  version?: number
}

export const seedCashAccount: CashAccount = {
  id: 'cash-001',
  name: 'Caja principal',
  currency: 'ARS',
  openingBalance: 2_500_000,
  openingBalanceDate: '2026-06-01',
  isActive: true,
}

/**
 * Hold's real treasury accounts, mirroring the administrator's position sheet:
 * operating Saldos (banks + cash boxes, per partner) and the reserve / Finanzas
 * Hold accounts (the FIMA investment fund + savings, flagged `isReserve`).
 * Balances are manually entered per lane (ARS / USD) and are fully editable
 * in the accounts manager. Partner assignments are best-effort defaults the admin
 * can reassign.
 */
export const seedAccounts: Account[] = [
  // ── Operating Saldos ────────────────────────────────────────────────────────
  { id: 'acc-001', name: 'Banco Vicky', partner: 'vicky', type: 'bank', balances: { ARS: 820_000, USD: 1_500 }, isActive: true },
  { id: 'acc-002', name: 'Banco Flor', partner: 'flor', type: 'bank', balances: { ARS: 640_000 }, isActive: true },
  { id: 'acc-003', name: 'Banco More', partner: 'more', type: 'bank', balances: { ARS: 410_000 }, isActive: true },
  { id: 'acc-004', name: 'Efectivo VT', partner: 'vicky', type: 'cash', balances: { ARS: 180_000 }, isActive: true },
  { id: 'acc-005', name: 'Efectivo FF', partner: 'flor', type: 'cash', balances: { ARS: 240_000, USD: 300 }, note: 'Incluye dólares de caja chica', isActive: true },
  { id: 'acc-006', name: 'Efectivo PG', partner: 'more', type: 'cash', balances: { ARS: 95_000 }, isActive: true },
  // ── Reserve / Finanzas Hold ─────────────────────────────────────────────────
  { id: 'acc-007', name: 'FIMA Fondo Común', partner: 'shared', type: 'investment', balances: { ARS: 3_200_000 }, isReserve: true, note: 'Fondo Común de Inversión', isActive: true },
  { id: 'acc-008', name: 'Saldo CA VT', partner: 'vicky', type: 'bank', balances: { USD: 4_200 }, isReserve: true, isActive: true },
  { id: 'acc-009', name: 'Saldo CA FF', partner: 'flor', type: 'bank', balances: { USD: 2_800 }, isReserve: true, isActive: true },
  { id: 'acc-010', name: 'Saldo MF', partner: 'shared', type: 'bank', balances: { ARS: 1_100_000 }, isReserve: true, isActive: true },
]

/**
 * Manual-only committed items. The bulk of the register is auto-derived from the
 * canonical recurring sources (fixed expenses, salaries, retainers) in
 * `treasury-derive.ts`; this seed holds only genuine one-offs that no recurring
 * source can produce. `TreasuryProvider` merges derived + manual (manual wins by
 * `linkedEntityId`).
 */
export const seedCommittedItems: CommittedItem[] = [
  {
    id: 'cmt-001',
    description: 'Aguinaldo (medio SAC)',
    direction: 'outflow',
    amount: 1_300_000,
    currency: 'ARS',
    category: 'salaries',
    recurrence: 'one_time',
    startDate: '2026-06-30',
    anchorDay: 28,
    confidence: 'committed',
    source: 'manual',
    isActive: true,
  },
  {
    // Manual USD receivable — has no canonical (ARS-only) cobros source, so the
    // admin tracks it by hand. Excluded from the ARS projection lane by currency.
    id: 'cmt-002',
    description: 'Honorarios cliente externo (USD)',
    direction: 'inflow',
    amount: 2_000,
    currency: 'USD',
    category: 'retainer',
    recurrence: 'one_time',
    startDate: '2026-06-20',
    anchorDay: 20,
    confidence: 'projected',
    source: 'manual',
    observations: 'Transferencia del exterior',
    isActive: true,
  },
  {
    // Manual USD payable (platform billed in dollars).
    id: 'cmt-003',
    description: 'Suscripción software (USD)',
    direction: 'outflow',
    amount: 450,
    currency: 'USD',
    category: 'platform',
    recurrence: 'one_time',
    startDate: '2026-06-15',
    anchorDay: 15,
    confidence: 'committed',
    source: 'manual',
    isActive: true,
  },
  {
    // Salary settled "a cuenta" in dated installments, with a reintegro still to
    // pay — mirrors the administrator's "Egresos Sueldo" block.
    id: 'cmt-004',
    description: 'Sueldo socias junio (a cuenta)',
    direction: 'outflow',
    amount: 900_000,
    currency: 'ARS',
    category: 'salaries',
    recurrence: 'one_time',
    startDate: '2026-06-23',
    anchorDay: 23,
    confidence: 'committed',
    source: 'manual',
    installments: [
      { date: '2026-06-12', amount: 300_000, note: 'a cuenta' },
      { date: '2026-06-19', amount: 300_000, note: 'a cuenta' },
    ],
    reimbursement: { amount: 50_000, owedBy: 'flor', note: 'Reintegro a realizar' },
    observations: 'Resto a liquidar el 23/6',
    isActive: true,
  },
]

/**
 * Bridges the real PayoutStatement API to the front's `MonthlyTeamStatement`.
 *
 * `/team`'s pay statement used to be DERIVED from the mock activity slices — the
 * total came from mock productions/extras/expenses and the partial payment was a
 * hash of the member id. Nothing it showed had ever left the browser. The canonical
 * payout row is the one `/operacion-mensual` already writes through `payoutsApi`,
 * so this module joins to it rather than forking a second store: the month owns the
 * plan, `PayoutStatement` owns the money, and `/team` reads it.
 *
 * Pure mapping only (no React, no store access) except the two fetch seams,
 * `fetchPeriodPayouts` (the money) and `fetchPeriodPlan` (the month's productions and
 * their per-member attribution). Both read the same monthly bundle.
 */
import { monthlyApi, type ProductionDto } from '@/api/monthly'
import type { PayoutStatementDto } from '@/api/payouts'
import { toMajor } from '@/lib/money'
import {
  PAYMENT_DUE_DAY,
  type MonthlyTeamStatement,
  type ProductionEntry,
  type TeamPaymentStatus,
} from './team-mock-data'

/** Integer minor units (centavos, serialized as a string) → major units. */

/**
 * The front's Estado de pago from the canonical row.
 *
 * The two vocabularies are NOT the same size: the API has four lifecycle states
 * (`draft` → `approved` → `dispatched` → `confirmed`) while the UI has six. The
 * extra ones are not statuses at all — `with_difference` is "money is still owed",
 * which lives in `outstandingMinor`, not in `statementStatus`. Deriving it from the
 * status alone is what would let a short-paid statement read as fully paid.
 *
 * `review` has no server counterpart and is therefore never produced. It stays in
 * the union because the badge/label maps are exhaustive over it; a server-side
 * review step would map here.
 */
export function payoutPaymentStatus(dto: PayoutStatementDto): TeamPaymentStatus {
  const outstanding = Number(dto.outstandingMinor ?? '0')
  const paid = Number(dto.paidAmountMinor ?? '0')
  switch (dto.statementStatus) {
    case 'draft':
      return 'pending'
    case 'confirmed':
      // Confirmed but short-paid is a real, common end state: the transfer cleared
      // for less than the total. It must not read as "Pagado".
      return outstanding > 0 ? 'with_difference' : 'paid'
    case 'dispatched':
      return 'processing'
    case 'approved':
      // A partial payment registered before dispatch — approved, money already moved,
      // balance still open.
      return paid > 0 && outstanding > 0 ? 'with_difference' : 'approved'
  }
}

/**
 * Map one canonical payout row onto the statement shape the whole `/team` module
 * already consumes, so the swap is a source change and not a UI rewrite.
 *
 * Three of the front's lines have NO server model and are therefore zero, not
 * invented: `hoursAmount` (there is no `TimeEntry` model at all), `extrasAmount`
 * (the API folds extras into `adjustmentsTotalMinor` — they are not a separate
 * line), and `deductionsAmount`. A UI that shows those lines must read them as the
 * zeros they are rather than presenting a fabricated split of the total.
 */
export function payoutToStatement(dto: PayoutStatementDto, monthId: string): MonthlyTeamStatement {
  const totalAmount = toMajor(dto.totalAmountMinor)
  const paidAmount = toMajor(dto.paidAmountMinor)
  const status = payoutPaymentStatus(dto)
  return {
    // The canonical payout id — this is what every lifecycle call is addressed to,
    // so it must be the server's id and never a synthesized `${memberId}-stmt-…`.
    id: dto.id,
    teamMemberId: dto.teamMemberId,
    month: monthId,
    baseAmount: toMajor(dto.baseAmountMinor),
    hoursAmount: 0,
    productionsAmount: toMajor(dto.productionsAmountMinor),
    extrasAmount: 0,
    expensesAmount: toMajor(dto.viaticsAmountMinor),
    adjustmentsAmount: toMajor(dto.adjustmentsTotalMinor),
    deductionsAmount: 0,
    totalAmount,
    status,
    paidAmount,
    differenceAmount: toMajor(dto.outstandingMinor),
    // The row's own due date when the plan set one; the studio's fixed payday otherwise.
    dueDate: dto.dueDate?.slice(0, 10) ?? `${monthId}-${String(PAYMENT_DUE_DAY).padStart(2, '0')}`,
    approvedAt: dto.approvedAt?.slice(0, 10),
    // The day the money left, as the operator entered it — a `@db.Date` column since
    // migration 0020, so it arrives as a day and needs no normalizing. It stays
    // undefined for every payout registered before that column existed, and for the
    // "Pagar diferencia" confirm on /team, which asks for no date: that is the honest
    // absence its consumers already handle. It is NOT derived from `approvedAt`, which
    // would date the payment on the day it was merely authorized — and the colaboradora
    // ledger (`account-ledger-mock-data.ts`) posts its movement on this date.
    paidAt: dto.paidAt ?? undefined,
  }
}

/** Statements for a period, keyed by member id. A member absent from the map has no
 *  plan for the month — the consumer must render that, not a zero-filled statement. */
export function payoutsByMember(
  dtos: PayoutStatementDto[],
  monthId: string,
): Record<string, MonthlyTeamStatement> {
  const byMember: Record<string, MonthlyTeamStatement> = {}
  for (const dto of dtos) byMember[dto.teamMemberId] = payoutToStatement(dto, monthId)
  return byMember
}

/**
 * Load the month's payout statements. They ride on the monthly plan bundle —
 * `/months/:period/plan` is the endpoint that returns them; there is no
 * `GET /payout-statements` list. Reusing the bundle also means `/team` and
 * `/operacion-mensual` read the same rows.
 *
 * The path segment is the MONTH id (`YYYY-MM`), not the `YYYY-MM-01` period the rest
 * of the app passes around: the route validates `period must be YYYY-MM` and 400s on
 * the full date. `/operacion-mensual` has always called it with its `MonthId` — the
 * mismatch is only visible against the real API, since a route stub matches the glob
 * either way.
 */
export async function fetchPeriodPayouts(monthId: string): Promise<PayoutStatementDto[]> {
  const bundle = await monthlyApi.getBundle(monthId)
  return bundle.payouts
}

/**
 * Payouts AND productions from ONE bundle read: the team surface needs both, and they
 * ride the same response, so fetching them separately would be a second request for rows
 * already on the wire.
 */
export async function fetchPeriodPlan(
  monthId: string,
): Promise<{ payouts: PayoutStatementDto[]; productions: ProductionDto[] }> {
  const bundle = await monthlyApi.getBundle(monthId)
  return { payouts: bundle.payouts, productions: bundle.productions }
}

/**
 * Map a month's productions onto the team store's per-member entries. One production can
 * involve several people, so it yields one entry PER attributed member — that is what makes
 * "Producciones" on a member's detail answerable at all. A production with no attribution
 * belongs to nobody in particular and is skipped rather than guessed at.
 */
export function productionsToEntries(rows: ProductionDto[]): ProductionEntry[] {
  return rows.flatMap((row) =>
    // `?? []` on purpose: attribution is a newer field, so a response that predates it (or
    // any stub that omits it) must yield no entries — never throw and take the whole team
    // store down with it.
    (row.attribution ?? []).map((who) => ({
      // One row per (production, member): the id must stay unique across both.
      id: `${row.id}:${who.teamMemberId}`,
      teamMemberId: who.teamMemberId,
      clientId: row.clientId ?? '',
      clientName: row.clientName ?? '',
      date: row.date,
      type: row.type,
      // The member's OWN hours when the split was recorded; null means "not recorded",
      // so it stays undefined rather than collapsing to 0.
      hours: who.hours ?? undefined,
      amount: toMajor(row.totalCostMinor),
      // `invoiced` means billed to the client; for the person who shot it, it is approved
      // work. The team side has no label for it and rendered an empty badge.
      status: (row.status === 'invoiced' ? 'approved' : row.status) as ProductionEntry['status'],
      notes: row.notes ?? undefined,
      loggedBy: row.responsible ?? undefined,
    })),
  )
}

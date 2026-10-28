/**
 * The payroll the studio still owes, for the Cashflow Posición.
 *
 * WHY THIS EXISTS. The Posición is `Saldos + Ingresos pendientes − Egresos pendientes`,
 * and payroll appeared in NONE of the three. A `PayoutStatement` is not a `Payment`, and
 * only `Payment` feeds "Egresos pendientes", so the largest outflow most studios have was
 * invisible until the day it was paid — at which point (since migration 0021) it lowers a
 * balance and the Posición drops by an amount nothing had anticipated.
 *
 * NO STATUS FILTER, deliberately. The lifecycle (draft → approved → dispatched →
 * confirmed) governs PAYING, not OWING, and this section answers what is owed: a
 * statement whose total the studio itself derived is money it expects to hand over
 * whether or not anyone has clicked approve. That is also how the section already treats
 * the other two sources — a receivable and a pago count by outstanding amount alone.
 */
import { payoutsApi, type PayoutStatementDto } from '@/api/payouts'

/** One statement's unpaid remainder, ready to render as a Posición row. */
export type PendingPayout = {
  id: string
  /** WHOSE liquidación. The Posición nets a commitment naming this colaboradora against
   *  it, so the row carries the id and not only the display name. */
  teamMemberId: string
  /** The colaboradora's name when the roster is loaded, a period label otherwise. */
  label: string
  /** 'YYYY-MM-DD' — the row's due date, or the period when it set none. */
  date: string
  amount: number
}

/** The API's cap: `listPayoutsQuerySchema` declares `.max(100)`. */
const PAGE = 100

/**
 * Every statement in the workspace, paged until exhausted.
 *
 * Paged rather than capped at one page BECAUSE this feeds a money TOTAL. A single
 * `limit: 100` read is what the pickers do, and it is fine for them — a list you scroll
 * degrades into a shorter list. A sum of a truncated page is not a partial figure, it is
 * a wrong one, and it would understate what the studio owes by however many statements
 * the cap left behind.
 */
export async function fetchOutstandingPayouts(): Promise<PayoutStatementDto[]> {
  const all: PayoutStatementDto[] = []
  for (let offset = 0; ; offset += PAGE) {
    const res = await payoutsApi.list({ limit: PAGE, offset })
    all.push(...res.items)
    if (all.length >= res.total || res.items.length < PAGE) break
  }
  return all.filter((dto) => Number(dto.outstandingMinor) > 0)
}

/**
 * Statements as Posición rows, named from the roster when it is available.
 *
 * The name is a NICETY and never a gate: if the roster fetch failed, the amounts are
 * still known and hiding them would restate the position by the whole of payroll to
 * avoid an unlabelled row. The period stands in, which is a true statement about the
 * money either way.
 */
export function pendingPayoutRows(
  dtos: PayoutStatementDto[],
  memberNameById: Record<string, string>,
): PendingPayout[] {
  return dtos.map((dto) => ({
    id: `payout-${dto.id}`,
    teamMemberId: dto.teamMemberId,
    label: memberNameById[dto.teamMemberId] ?? `Liquidación ${dto.period.slice(0, 7)}`,
    // `dueDate` is the day the studio said it would pay; the period is the honest
    // fallback when the plan set none. Neither is invented.
    date: dto.dueDate ?? dto.period,
    // Minor units to pesos, like every other amount crossing this boundary.
    amount: Number(dto.outstandingMinor) / 100,
  }))
}

/** Edge validation (Zod) + DTOs for the Reports / analytics module. */
import { z } from 'zod';

export const reportPeriodQuerySchema = z.object({
  period: z.coerce.date().optional(),
});

export interface SummaryDto {
  period: string | null;
  /** Every money figure below is PESOS. `otherLaneCount` is how many rows of the period
   *  were left out for being in another lane, so the screen can say so instead of
   *  reporting a quietly smaller number. */
  revenue: { billedMinor: string; collectedMinor: string; count: number; otherLaneCount: number };
  payouts: { totalMinor: string; paidMinor: string; count: number };
  payments: { totalMinor: string; paidMinor: string; count: number; otherLaneCount: number };
  netCollectedMinusPaidMinor: string;
}

export interface FinancialsDto {
  period: string | null;
  cashInMinor: string;
  cashOutMinor: string;
  netMinor: string;
}

export interface ClientProfitabilityDto {
  clientId: string;
  clientName: string;
  billedMinor: string;
  collectedMinor: string;
  collectionRatePct: number;
  /**
   * What the studio pays the people assigned to this client this month, from their
   * assignments. `null` when the caller does not hold `teamCost`: the figure is then
   * left out of `costTotalMinor` and the margin too, because a client with one person on
   * it would otherwise publish that person's pay to anyone who can open Rentabilidad.
   */
  costTeamMinor: string | null;
  // Cost breakdown by area entered on the cobro. Design, communication and production
  // are no longer writable (team cost now comes from assignments) and stay here, always
  // zero, only so a browser still holding the previous build does not fail to parse.
  costDesignMinor: string;
  costCommMinor: string;
  costProductionMinor: string;
  costViaticsMinor: string;
  costPautaMinor: string;
  costFixedMinor: string;
  costTotalMinor: string;
  // Margin = billed − costTotal ("Renta"); marginPct against billed (0 when unbilled).
  marginMinor: string;
  marginPct: number;
}

export interface ProfitabilityDto {
  period: string | null;
  /** PESO rows only: the costs subtracted from `billedMinor` are peso columns, so a
   *  non-peso cobro would produce a margin in no currency. */
  byClient: ClientProfitabilityDto[];
  /** Clients whose period billing is entirely in another lane, and which are therefore
   *  absent from `byClient` altogether. A count, not an amount: there is no honest total
   *  across lanes. Zero is the normal case. */
  otherLaneClientCount: number;
  /**
   * What the studio spent in the period (team, creator pay and viáticos, by the same
   * `teamCost` rule as the rows) on clients that have NO peso cobro in it yet, and so no
   * row. Stated beside the table so a cost that exists never reads as one that "does not
   * load". Churned clients are left out: they will not be billed again.
   */
  unbilledCost: { clientCount: number; costMinor: string };
}

/** One client's month for its own Resumen, billed yet or not (`reportsService.clientMonth`). */
export interface ClientMonthDto {
  period: string;
  /** What its peso cobros billed in the month; '0' while none exists. */
  billedMinor: string;
  /** What the studio pays the people assigned to it. Null without `teamCost`. */
  costTeamMinor: string | null;
  /** What its approved productions paid their creators. Null without `teamCost`. */
  costProductionMinor: string | null;
  /** Its productions' viáticos (and any recorded on its cobros). */
  costViaticsMinor: string;
  /** What its cobros recorded as cost: pauta, fijos and the legacy area columns. */
  costOtherMinor: string;
  costTotalMinor: string;
}

export const clientMonthParamsSchema = z.object({ clientId: z.uuid() });

/** Per-member workload + real monthly cost. `capacityHours`/`utilizationPct` are
 *  null until HOLD loads hours; `teamCostMinor` ("Le pagamos x cliente") is always real. */
export interface MemberCapacityDto {
  personId: string;
  personName: string;
  role: string;
  clientsActive: number;
  clientNames: string[];
  hoursAllocated: number;
  capacityHours: number | null;
  utilizationPct: number | null;
  /** What the studio pays this member across their clients, in minor units.
   *
   *  `null` = no assignment of theirs carries a cost, or the caller does not hold
   *  `teamCost`. NEVER `'0'` for either: nothing wrote this column until it gained a
   *  form, so a zero could only ever mean "never entered", and Reports printed it as
   *  `$ 0` — a measured figure the studio did not have. */
  teamCostMinor: string | null;
  /** How many of this member's assignments carry a cost, out of how many there are.
   *  A PARTIAL sum is the dangerous case: a real number that silently understates by
   *  the uncosted assignments, with nothing on screen to say so. */
  costedAssignments: number;
  totalAssignments: number;
}

export interface CapacityDto {
  members: MemberCapacityDto[];
}

/** One logged unit of work, sourced from a `TimeEntry` row (hours, not money — so no
 *  minor units). `service` has no column on TimeEntry yet, so it defaults to 'General';
 *  `clientId`/`clientName`/`clientStatus` are empty for an entry logged with no client. */
export interface ProductivityItemDto {
  id: string;
  personId: string;
  personName: string;
  clientId: string;
  clientName: string;
  taskType: string;
  service: string;
  hours: number;
  /** `YYYY-MM-DD`. */
  date: string;
  isExtra: boolean;
  clientStatus: string;
}

export interface ProductivityDto {
  period: string | null;
  items: ProductivityItemDto[];
}

/** One month's studio-wide margin (billed − area cost), in minor units. */
export interface MarginHistoryPointDto {
  period: string; // YYYY-MM
  marginMinor: string;
}

export interface MarginHistoryDto {
  points: MarginHistoryPointDto[];
}

/** One month's logged hours for a member. */
export interface HoursHistoryPointDto {
  period: string; // YYYY-MM
  hours: number;
}

export interface HoursHistoryDto {
  points: HoursHistoryPointDto[];
}

/** `?clientId=` narrows the margin trend to one client; absent = studio-wide. */
export const marginHistoryQuerySchema = z.object({ clientId: z.uuid().optional() });
export const hoursHistoryQuerySchema = z.object({ teamMemberId: z.uuid() });

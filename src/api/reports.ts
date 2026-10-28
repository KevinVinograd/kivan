/** Reports resource calls — thin typed wrappers over the api client. */
import { z } from 'zod'
import { apiClient } from './client'

/** Shape of `GET /reports/summary` (owner + admin). Amounts are integer minor
 *  units (cents) serialized as strings; the front converts to major units. The
 *  response is Zod-validated at the fetch boundary (see api/client.ts). */
export const ReportsSummarySchema = z.object({
  period: z.string().nullable(),
  // `otherLaneCount` is `.default(0)` for ONE release: Deploy Web and Deploy API fire
  // independently, so the new bundle runs against the old API for several minutes, and a
  // required key would throw at the fetch boundary and put Reportes into its error state.
  revenue: z.object({
    billedMinor: z.string(),
    collectedMinor: z.string(),
    count: z.number(),
    otherLaneCount: z.number().default(0),
  }),
  payouts: z.object({ totalMinor: z.string(), paidMinor: z.string(), count: z.number() }),
  payments: z.object({
    totalMinor: z.string(),
    paidMinor: z.string(),
    count: z.number(),
    otherLaneCount: z.number().default(0),
  }),
  netCollectedMinusPaidMinor: z.string(),
})
export type ReportsSummaryDto = z.infer<typeof ReportsSummarySchema>

/** `GET /reports/profitability` (needs the `profitability` capability). Per client: revenue side + the six
 *  area costs (HOLD's "GASTO POR ÁREA" + allocated fixed), total cost and margin.
 *  All amounts are minor-unit strings; the front converts to pesos. */
export const ClientProfitabilitySchema = z.object({
  clientId: z.string(),
  clientName: z.string(),
  billedMinor: z.string(),
  collectedMinor: z.string(),
  collectionRatePct: z.number(),
  // What the studio pays the people assigned to the client this month. `null` when the
  // viewer may not see team cost; optional so a browser on this build still parses the
  // previous API during the deploy window.
  costTeamMinor: z.string().nullable().optional(),
  costDesignMinor: z.string(),
  costCommMinor: z.string(),
  costProductionMinor: z.string(),
  costViaticsMinor: z.string(),
  costPautaMinor: z.string(),
  costFixedMinor: z.string(),
  costTotalMinor: z.string(),
  marginMinor: z.string(),
  marginPct: z.number(),
})
export type ClientProfitabilityDto = z.infer<typeof ClientProfitabilitySchema>

export const ReportsProfitabilitySchema = z.object({
  period: z.string().nullable(),
  byClient: z.array(ClientProfitabilitySchema),
  /** Clients billed only in another lane, absent from `byClient` entirely.
   *  `.default(0)` for the deploy window: an older API omits the field. */
  otherLaneClientCount: z.number().default(0),
  /** What clients with NO peso cobro in the period cost (they have no row). Defaulted for
   *  the deploy window: an older API omits it. */
  unbilledCost: z.object({ clientCount: z.number(), costMinor: z.string() }).default({ clientCount: 0, costMinor: '0' }),
})
export type ReportsProfitabilityDto = z.infer<typeof ReportsProfitabilitySchema>

/** `GET /reports/clients/:id/month` (needs `profitability`): one client's month for its
 *  Resumen, billed yet or not. Team and creator pay are null without `teamCost`. */
export const ClientMonthSchema = z.object({
  period: z.string(),
  billedMinor: z.string(),
  costTeamMinor: z.string().nullable(),
  costProductionMinor: z.string().nullable(),
  costViaticsMinor: z.string(),
  costOtherMinor: z.string(),
  costTotalMinor: z.string(),
})
export type ClientMonthDto = z.infer<typeof ClientMonthSchema>

/** `GET /reports/capacity` (owner+admin; cost needs `teamCost`). Per member: real monthly cost + client
 *  count; hours/utilization are null until HOLD loads hours. Period-agnostic. */
export const MemberCapacitySchema = z.object({
  personId: z.string(),
  personName: z.string(),
  role: z.string(),
  clientsActive: z.number(),
  clientNames: z.array(z.string()),
  hoursAllocated: z.number(),
  capacityHours: z.number().nullable(),
  utilizationPct: z.number().nullable(),
  // Nullable: `null` = no assignment of theirs carries a cost, or the caller lacks
  // `teamCost`. NEVER '0' for either — nothing wrote that column until it gained a form,
  // so a zero could only mean "never entered", and Reports printed it as `$ 0`.
  teamCostMinor: z.string().nullable().optional(),
  // How many of this member's assignments carry a cost, out of how many exist. A PARTIAL
  // sum is the dangerous case: a real number that understates by the uncosted ones.
  // Defaulted for the deploy-skew window, where the old API sends neither.
  costedAssignments: z.number().optional().default(0),
  totalAssignments: z.number().optional().default(0),
})
export type MemberCapacityDto = z.infer<typeof MemberCapacitySchema>

export const ReportsCapacitySchema = z.object({
  members: z.array(MemberCapacitySchema),
})
export type ReportsCapacityDto = z.infer<typeof ReportsCapacitySchema>

/** `GET /reports/productivity` (owner+admin). One row per logged TimeEntry — hours,
 *  not money, so no minor-unit conversion. `service` defaults to 'General' server-side. */
export const ProductivityItemSchema = z.object({
  id: z.string(),
  personId: z.string(),
  personName: z.string(),
  clientId: z.string(),
  clientName: z.string(),
  taskType: z.string(),
  service: z.string(),
  hours: z.number(),
  date: z.string(),
  isExtra: z.boolean(),
  clientStatus: z.string(),
})
export type ProductivityItemDto = z.infer<typeof ProductivityItemSchema>

export const ReportsProductivitySchema = z.object({
  period: z.string().nullable(),
  items: z.array(ProductivityItemSchema),
})
export type ReportsProductivityDto = z.infer<typeof ReportsProductivitySchema>

/** `GET /reports/margin-history` (needs `profitability`). Studio-wide margin per month
 *  over the last 6 months, oldest first; `marginMinor` is a minor-unit string. */
export const MarginHistoryPointSchema = z.object({
  period: z.string(),
  marginMinor: z.string(),
})
export type MarginHistoryPointDto = z.infer<typeof MarginHistoryPointSchema>

export const ReportsMarginHistorySchema = z.object({
  points: z.array(MarginHistoryPointSchema),
})
export type ReportsMarginHistoryDto = z.infer<typeof ReportsMarginHistorySchema>

/** `GET /reports/hours-history?teamMemberId=` (owner+admin). One member's logged hours
 *  per month over the last 6 months, oldest first. */
export const HoursHistoryPointSchema = z.object({ period: z.string(), hours: z.number() })
export type HoursHistoryPointDto = z.infer<typeof HoursHistoryPointSchema>

export const ReportsHoursHistorySchema = z.object({
  points: z.array(HoursHistoryPointSchema),
})
export type ReportsHoursHistoryDto = z.infer<typeof ReportsHoursHistorySchema>

export const reportsApi = {
  summary: (period?: string) =>
    apiClient.get<ReportsSummaryDto>('/reports/summary', {
      ...(period ? { params: { period } } : {}),
      schema: ReportsSummarySchema,
    }),
  profitability: (period?: string) =>
    apiClient.get<ReportsProfitabilityDto>('/reports/profitability', {
      ...(period ? { params: { period } } : {}),
      schema: ReportsProfitabilitySchema,
    }),
  capacity: () =>
    apiClient.get<ReportsCapacityDto>('/reports/capacity', { schema: ReportsCapacitySchema }),
  productivity: (period?: string) =>
    apiClient.get<ReportsProductivityDto>('/reports/productivity', {
      ...(period ? { params: { period } } : {}),
      schema: ReportsProductivitySchema,
    }),
  clientMonth: (clientId: string, period: string) =>
    apiClient.get<ClientMonthDto>(`/reports/clients/${clientId}/month`, {
      params: { period },
      schema: ClientMonthSchema,
    }),
  marginHistory: (clientId?: string) =>
    apiClient.get<ReportsMarginHistoryDto>('/reports/margin-history', {
      ...(clientId ? { params: { clientId } } : {}),
      schema: ReportsMarginHistorySchema,
    }),
  hoursHistory: (teamMemberId: string) =>
    apiClient.get<ReportsHoursHistoryDto>('/reports/hours-history', {
      params: { teamMemberId },
      schema: ReportsHoursHistorySchema,
    }),
}

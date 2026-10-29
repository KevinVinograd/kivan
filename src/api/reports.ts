import { z } from 'zod'
import { apiClient } from './client'

export const ReportsSummarySchema = z.object({
  period: z.string().nullable(),
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

export const ClientProfitabilitySchema = z.object({
  clientId: z.string(),
  clientName: z.string(),
  billedMinor: z.string(),
  collectedMinor: z.string(),
  collectionRatePct: z.number(),
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
  otherLaneClientCount: z.number().default(0),
  unbilledCost: z.object({ clientCount: z.number(), costMinor: z.string() }).default({ clientCount: 0, costMinor: '0' }),
})
export type ReportsProfitabilityDto = z.infer<typeof ReportsProfitabilitySchema>

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

export const MemberCapacitySchema = z.object({
  personId: z.string(),
  personName: z.string(),
  role: z.string(),
  clientsActive: z.number(),
  clientNames: z.array(z.string()),
  hoursAllocated: z.number(),
  capacityHours: z.number().nullable(),
  utilizationPct: z.number().nullable(),
  // null = no cost entered or no teamCost access. Never coerce it to '0'.
  teamCostMinor: z.string().nullable().optional(),
  costedAssignments: z.number().optional().default(0),
  totalAssignments: z.number().optional().default(0),
})
export type MemberCapacityDto = z.infer<typeof MemberCapacitySchema>

export const ReportsCapacitySchema = z.object({
  members: z.array(MemberCapacitySchema),
})
export type ReportsCapacityDto = z.infer<typeof ReportsCapacitySchema>

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

export const MarginHistoryPointSchema = z.object({
  period: z.string(),
  marginMinor: z.string(),
})
export type MarginHistoryPointDto = z.infer<typeof MarginHistoryPointSchema>

export const ReportsMarginHistorySchema = z.object({
  points: z.array(MarginHistoryPointSchema),
})
export type ReportsMarginHistoryDto = z.infer<typeof ReportsMarginHistorySchema>

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

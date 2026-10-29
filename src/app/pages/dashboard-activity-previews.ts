import type {
  ClientProfitabilityReportItem,
  ReportDataset,
  TeamCapacityReportItem,
} from './reports-types'

export type ActivityPreviews = {
  clients: Record<string, ClientProfitabilityReportItem>
  people: Record<string, TeamCapacityReportItem>
}

export function buildActivityPreviews(report: ReportDataset | null): ActivityPreviews {
  const clients: Record<string, ClientProfitabilityReportItem> = {}
  const people: Record<string, TeamCapacityReportItem> = {}
  if (report) {
    for (const item of report.profitability) clients[item.clientId] = item
    for (const item of report.capacity) people[item.personId] = item
  }
  return { clients, people }
}

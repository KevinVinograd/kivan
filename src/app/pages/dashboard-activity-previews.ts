/**
 * Recent-activity entity preview resolver (Owner / Admin dashboards).
 *
 * Maps the seeded ids carried by the curated activity feed (`cli-*` / `tm-*`) to
 * the canonical report-derived preview models, so the recent-activity hover card /
 * bottom sheet can show the same rich client/person preview used elsewhere in the
 * app. Pure: derived from the period's `ReportDataset` (null when the month has no
 * loaded data, yielding empty maps and a name-only fallback at the call site).
 */
import type {
  ClientProfitabilityReportItem,
  ReportDataset,
  TeamCapacityReportItem,
} from './reports-types'

/** Per-id lookups for the recent-activity entity previews. */
export type ActivityPreviews = {
  /** clientId (`cli-*`) → profitability preview model. */
  clients: Record<string, ClientProfitabilityReportItem>
  /** personId (`tm-*`) → capacity preview model. */
  people: Record<string, TeamCapacityReportItem>
}

/** Index the period report's profitability + capacity items by their entity id. */
export function buildActivityPreviews(report: ReportDataset | null): ActivityPreviews {
  const clients: Record<string, ClientProfitabilityReportItem> = {}
  const people: Record<string, TeamCapacityReportItem> = {}
  if (report) {
    for (const item of report.profitability) clients[item.clientId] = item
    for (const item of report.capacity) people[item.personId] = item
  }
  return { clients, people }
}

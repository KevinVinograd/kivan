import { cn } from '@/app/lib/utils'
import { Card, CardContent } from '@/app/components/components'
import { KPI_TONE_FG } from '@/app/components/patterns'
import type { KpiTone } from './reports-format'

/** A related metric shown small beneath a group's primary value. */
export type ReportKpiSecondary = { label: string; value: string; tone?: KpiTone }

/** A grouped KPI: one primary value with related secondaries condensed beneath it. */
export type ReportKpiGroup = {
  id: string
  label: string
  value: string
  tone?: KpiTone
  secondaries: ReportKpiSecondary[]
}

function ReportKpiGroupTile({ group }: { group: ReportKpiGroup }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <span className="type-caption fg-subtle">{group.label}</span>
          {/* Uniform primary size across the 3 grouped cards — primacy reads through
              the group's state tint (e.g. Rentabilidad total green), not a size hero,
              so the peer cards stay balanced. */}
          <span className={cn('type-metric-2 tabular-nums', KPI_TONE_FG[group.tone ?? 'default'])}>
            {group.value}
          </span>
        </div>
        {group.secondaries.length > 0 ? (
          <div className="flex flex-col gap-1 border-t border-alpha-subtle pt-3">
            {group.secondaries.map((secondary) => (
              <div key={secondary.label} className="flex items-center justify-between gap-2">
                <span className="type-caption fg-subtle">{secondary.label}</span>
                <span className={cn('type-body-2 tabular-nums', KPI_TONE_FG[secondary.tone ?? 'default'])}>
                  {secondary.value}
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

/**
 * Condensed KPI grid: fewer cards, each a primary value with its related
 * secondaries stacked beneath. Used by Rentabilidad and Finanzas operativas to
 * collapse six/seven flat tiles into three grouped cards.
 */
export function ReportKpiGroupGrid({ groups }: { groups: ReportKpiGroup[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:gap-6 px-4 md:px-6 lg:px-8 desktop:px-10 sm:grid-cols-2 lg:grid-cols-3">
      {groups.map((group) => (
        <ReportKpiGroupTile key={group.id} group={group} />
      ))}
    </div>
  )
}

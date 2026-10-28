import { cn } from '@/app/lib/utils'
import { hasCapability } from '@hold/shared'
import { todayIso } from '@/app/lib/iso-date'
import { useRole } from '@/app/lib/use-role'
import { Card, CardContent } from '@/app/components/components'
import type { Client } from './clients-mock-data'
import { KPI_TONE_FG, type BreakdownRow } from './clients-format'
import { useClientMonth, useClientServiceLines } from './client-month-data'
import { clientProfitBreakdown, contractedFeeOf, monthCostDetail } from './client-month-breakdown'

/** One KPI tile: caption label above a prominent, tone-colored figure. */
function KpiTile({ row }: { row: BreakdownRow }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1">
        <span className="type-caption fg-subtle">{row.label}</span>
        <span className={cn('type-section tabular-nums', KPI_TONE_FG[row.tone ?? 'default'])}>
          {row.value}
        </span>
        {row.hint ? <span className="type-caption fg-subtle">{row.hint}</span> : null}
      </CardContent>
    </Card>
  )
}

/**
 * Monthly P&L for the detail overview. Costo and Ganancia are profitability —
 * gated by the `profitability` capability; roles without it keep only the operational
 * Fee mensual figure, and never ask for the month's costs.
 */
export function ClientKpis({ client }: { client: Client }) {
  const { capabilities } = useRole()
  const canSeeProfit = hasCapability(capabilities, 'profitability')
  const month = useClientMonth(client.id, todayIso().slice(0, 7), canSeeProfit)
  const lines = useClientServiceLines(client.id)
  // clientProfitBreakdown returns [Fee mensual, Costo, Ganancia] in that order.
  const breakdown = clientProfitBreakdown(client, month.data, contractedFeeOf(client, lines.data))
  const rows = canSeeProfit ? breakdown : breakdown.slice(0, 1)
  const cols = rows.length >= 3 ? 'grid-cols-3' : rows.length === 2 ? 'grid-cols-2' : 'grid-cols-1'
  const detail = canSeeProfit && month.data ? monthCostDetail(month.data) : null
  return (
    <div className="flex flex-col gap-2">
      <div className={cn('grid gap-3', cols)}>
        {rows.map((row) => (
          <KpiTile key={row.label} row={row} />
        ))}
      </div>
      {detail ? <span className="type-caption fg-subtle">{detail}</span> : null}
    </div>
  )
}

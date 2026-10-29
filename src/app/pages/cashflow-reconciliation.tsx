import { cn } from '@/app/lib/utils'
import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/app/components/components'
import { KpiSummaryCard } from '@/app/components/patterns'
import type { Currency } from './treasury-mock-data'
import { formatCompactLaneAmount } from './treasury-position-view'
import {
  reconciliationKpis,
  type ReconciliationRow,
  type ReconciliationSummary,
} from './treasury-view'
import { CashflowLaneSelect } from './cashflow-lane-select'

function NetCell({ value, currency }: { value: number | null; currency: Currency }) {
  if (value === null) {
    return <TableCell className="text-right fg-subtle">-</TableCell>
  }
  return (
    <TableCell className={cn('text-right tabular-nums', value < 0 ? 'fg-danger' : 'fg-default')}>
      {`${value > 0 ? '+' : ''}${formatCompactLaneAmount(value, currency)}`}
    </TableCell>
  )
}

export function CashflowReconciliation({
  rows,
  summary,
  lane,
  lanes,
  onLaneChange,
}: {
  rows: ReconciliationRow[]
  summary: ReconciliationSummary
  lane: Currency
  lanes: Currency[]
  onLaneChange: (lane: Currency) => void
}) {
  const kpis = reconciliationKpis(summary, lane)
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <CashflowLaneSelect lane={lane} lanes={lanes} onChange={onLaneChange} />

      <div className="px-4 md:px-6 lg:px-8 desktop:px-10">
        <KpiSummaryCard figures={kpis} heroId="variance" collapsible storageKey="cashflow-reconciliation" />
      </div>
      <div className="px-4 md:px-6 lg:px-8 desktop:px-10">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Semana</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Plan</TableHead>
              <TableHead className="text-right">Real</TableHead>
              <TableHead className="text-right">Variación</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.weekStart}>
                <TableCell className="fg-default">{row.weekLabel}</TableCell>
                <TableCell>
                  <Badge variant={row.isElapsed ? 'neutral' : 'outline'}>
                    {row.isElapsed ? 'Cerrada' : 'Proyectada'}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums fg-default">
                  {formatCompactLaneAmount(row.planNet, lane)}
                </TableCell>
                <NetCell value={row.actualNet} currency={lane} />
                <NetCell value={row.variance} currency={lane} />
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

import { cn } from '@/app/lib/utils'
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/app/components/components'
import { KpiSummaryCard } from '@/app/components/patterns'
import {
  CartesianGrid,
  ChartContainer,
  ChartTooltipContent,
  Line,
  LineChart,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from '@/app/components/charts'
import type { CashflowWeek } from './treasury-format'
import type { Currency } from './treasury-mock-data'
import {
  cashflowChartSeries,
  cashflowKpis,
  cashflowMatrix,
  weekLabel,
  type CashflowCategoryRow,
} from './treasury-view'
import { formatCompactLaneAmount, formatLaneAmount } from './treasury-position-view'
import { CashflowLaneSelect } from './cashflow-lane-select'

// Recharts forwards `className` from the tick object to the SVG <text> (verified: the
// rendered node carries `type-caption` and computes to 12px, with no font-size attribute),
// so axis ticks take their size from the type scale instead of a raw `fontSize: 12`.
const AXIS_TICK = { fill: 'var(--color-fg-subtle)', className: 'type-caption' }

/**
 * A money cell in the 13-week matrix — compact, lane-aware, right-aligned, tabular.
 * Category / total rows show "-" for a zero week (noise reduction); balance rows
 * (Apertura / Cierre) pass `dash={false}` so a real 0 balance always shows a figure.
 */
function MoneyCell({
  amount,
  currency,
  danger,
  dash = true,
}: {
  amount: number
  currency: Currency
  danger?: boolean
  dash?: boolean
}) {
  return (
    <TableCell className={cn('text-right tabular-nums', danger ? 'fg-danger' : 'fg-default')}>
      {dash && amount === 0 ? '-' : formatCompactLaneAmount(amount, currency)}
    </TableCell>
  )
}

/** A grouped category row (Sueldos, Abonos, …) inside the inflow / outflow band. */
function CategoryRow({ row, currency }: { row: CashflowCategoryRow; currency: Currency }) {
  return (
    <TableRow>
      <TableCell className="fg-subtle">{row.label}</TableCell>
      {row.amounts.map((amount, index) => (
        <MoneyCell key={index} amount={amount} currency={currency} />
      ))}
    </TableRow>
  )
}

/**
 * Proyección tab — the projective view of the 13-week window for the selected
 * currency lane: a lane selector, the KPI strip, the running-balance line chart
 * with a zero baseline, a cash-crunch warning, and the matrix table (weeks as
 * columns; opening / inflows by category / total in / outflows by category / total
 * out / closing). All figures come from the pure `treasury-view` model over the
 * engine output; this file only composes approved components and maps tones to
 * tokens. Only the ARS lane carries cobros/pagos actuals; other lanes project from
 * their manual commitments alone.
 */
export function CashflowProjection({
  weeks,
  lane,
  lanes,
  onLaneChange,
}: {
  weeks: CashflowWeek[]
  lane: Currency
  lanes: Currency[]
  onLaneChange: (lane: Currency) => void
}) {
  const kpis = cashflowKpis(weeks, lane)
  const series = cashflowChartSeries(weeks)
  const matrix = cashflowMatrix(weeks)
  const firstCrunch = weeks.find((week) => week.isBelowZero)

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <CashflowLaneSelect lane={lane} lanes={lanes} onChange={onLaneChange} />

      {/* §6 Proyección focal → Cierre proyectado (the single card's 52px hero). */}
      <div className="px-4 md:px-6 lg:px-8 desktop:px-10">
        <KpiSummaryCard figures={kpis} heroId="closing" collapsible storageKey="cashflow-projection" />
      </div>

      {firstCrunch ? (
        <div className="px-4 md:px-6 lg:px-8 desktop:px-10">
          <Alert variant="warning">
            <AlertTitle>Alerta de caja</AlertTitle>
            <AlertDescription>
              El saldo proyectado cae por debajo de cero la semana del{' '}
              {weekLabel(firstCrunch.weekStart)}. Revisá los compromisos o el saldo inicial.
            </AlertDescription>
          </Alert>
        </div>
      ) : null}

      <div className="px-4 md:px-6 lg:px-8 desktop:px-10">
        <Card>
          <CardContent>
            <ChartContainer
              ariaLabel="Saldo de caja proyectado por semana, con una línea de referencia en cero."
              height={220}
            >
              <LineChart data={series} margin={{ left: 8, right: 16, top: 8, bottom: 4 }}>
                <CartesianGrid vertical={false} stroke="var(--color-border-alpha-subtle)" />
                <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
                <YAxis
                  tick={AXIS_TICK}
                  axisLine={false}
                  tickLine={false}
                  width={64}
                  tickFormatter={(value) => formatCompactLaneAmount(Number(value), lane)}
                />
                <ReferenceLine y={0} stroke="var(--color-fg-subtle)" strokeDasharray="4 4" />
                <Tooltip
                  content={<ChartTooltipContent formatValue={(value) => formatLaneAmount(value, lane)} />}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="var(--color-data-blue)"
                  strokeWidth={2}
                  dot={{ fill: 'var(--color-data-blue)', r: 3 }}
                />
              </LineChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </div>

      <div className="px-4 md:px-6 lg:px-8 desktop:px-10">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Semana</TableHead>
              {matrix.weekLabels.map((label, index) => (
                <TableHead key={index} className="text-right">
                  {label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-medium fg-default">Apertura</TableCell>
              {matrix.openingRow.map((amount, index) => (
                <MoneyCell key={index} amount={amount} currency={lane} dash={false} />
              ))}
            </TableRow>

            {matrix.inflowRows.map((row) => (
              <CategoryRow key={`in-${row.category}`} row={row} currency={lane} />
            ))}
            <TableRow>
              <TableCell className="font-medium fg-default">Total ingresos</TableCell>
              {matrix.totalInflows.map((amount, index) => (
                <MoneyCell key={index} amount={amount} currency={lane} />
              ))}
            </TableRow>

            {matrix.outflowRows.map((row) => (
              <CategoryRow key={`out-${row.category}`} row={row} currency={lane} />
            ))}
            <TableRow>
              <TableCell className="font-medium fg-default">Total egresos</TableCell>
              {matrix.totalOutflows.map((amount, index) => (
                <MoneyCell key={index} amount={amount} currency={lane} />
              ))}
            </TableRow>

            <TableRow>
              <TableCell className="font-medium fg-default">Cierre</TableCell>
              {matrix.closingRow.map((amount, index) => (
                <MoneyCell key={index} amount={amount} currency={lane} danger={matrix.belowZero[index]} dash={false} />
              ))}
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

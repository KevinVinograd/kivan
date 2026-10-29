import {
  Bar,
  BarChart,
  Cell,
  ChartContainer,
  ChartTooltipContent,
  LabelList,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from '@/app/components/charts'
import { formatPercent } from './dashboard-format'
import type { MarginBand, MarginClient } from './dashboard-types'

// Literal var() strings only: Tailwind cannot see a composed var(--color-data-${x}) and it renders black.
const BAND_FILL: Record<MarginBand, string> = {
  high: 'var(--color-data-success)',
  medium: 'var(--color-data-neutral)',
  low: 'var(--color-data-danger)',
}

const AXIS_TICK = { fill: 'var(--color-fg-subtle)', className: 'type-caption' }

const BAR_BAND = 40

const MAX_BAR_SIZE = 20

const TRAIL_HEADROOM = 0.05
const LEAD_HEADROOM_BASE = 0.1
const LEAD_HEADROOM_PER_CHAR = 0.065

function valueDomain(values: number[], widestLabel: number): [number, number] {
  const min = Math.min(0, ...values)
  const max = Math.max(0, ...values)
  const span = Math.max(1, max - min)
  const lead = span * (LEAD_HEADROOM_BASE + LEAD_HEADROOM_PER_CHAR * widestLabel)
  const trail = span * TRAIL_HEADROOM
  return [min - (min < 0 ? lead : trail), max + (max > 0 ? lead : trail)]
}

export function MarginBarChart({
  clients,
  ariaLabel,
}: {
  clients: MarginClient[]
  ariaLabel: string
}) {
  if (clients.length === 0) {
    return <p className="px-2 py-6 text-center type-caption fg-subtle">Sin datos para graficar</p>
  }

  const data = clients.map((client) => ({
    id: client.clientId,
    label: client.clientName,
    value: client.marginPercent,
    band: client.band,
  }))
  const widestLabel = Math.max(...data.map((datum) => formatPercent(datum.value).length))

  const spokenLabel = `${ariaLabel}: ${data
    .map((datum) => `${datum.label} ${formatPercent(datum.value)}`)
    .join(', ')}`

  return (
    <ChartContainer ariaLabel={spokenLabel} height={Math.max(120, data.length * BAR_BAND)}>
      <BarChart layout="vertical" data={data} margin={{ left: 0, right: 4, top: 4, bottom: 4 }}>
        <XAxis
          type="number"
          hide
          domain={valueDomain(
            data.map((datum) => datum.value),
            widestLabel,
          )}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={104}
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: 'var(--color-bg-alpha-subtle-hover)' }}
          content={<ChartTooltipContent hideLabel formatValue={(value) => formatPercent(value)} />}
        />
        <ReferenceLine x={0} stroke="var(--color-fg-subtle)" strokeDasharray="4 4" />
        <Bar dataKey="value" radius={2} maxBarSize={MAX_BAR_SIZE}>
          {data.map((datum) => (
            <Cell key={datum.id} fill={BAND_FILL[datum.band]} />
          ))}
          <LabelList
            dataKey="value"
            position="right"
            className="type-caption tabular-nums"
            fill="var(--color-fg-default)"
            formatter={(value: unknown) =>
              typeof value === 'number' ? formatPercent(value) : ''
            }
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

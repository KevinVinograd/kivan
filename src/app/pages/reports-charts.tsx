import { useState } from 'react'

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ChartContainer,
  ChartTooltipContent,
  Line,
  LineChart,
  Pie,
  PieChart,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from '@/app/components/charts'
import { formatHours } from './reports-format'
import {
  OTHER_BUCKET_ID,
  topRanked,
  withOtherBucket,
  type AgingBucket,
  type ChartDatum,
  type CohortRanking,
} from './reports-aggregations'

// Literal var() strings only: Tailwind cannot see a composed var(--color-data-${x}) and it renders black.
export const DATA_FILL = {
  blue: 'var(--color-data-blue)',
  orange: 'var(--color-data-orange)',
  green: 'var(--color-data-green)',
  purple: 'var(--color-data-purple)',
  pink: 'var(--color-data-pink)',
  aqua: 'var(--color-data-aqua)',
  yellow: 'var(--color-data-yellow)',
  red: 'var(--color-data-red)',
  emerald: 'var(--color-data-emerald)',
  navy: 'var(--color-data-navy)',
  beige: 'var(--color-data-beige)',
  forest: 'var(--color-data-forest)',
  gray: 'var(--color-data-gray)',
} as const

type DataColor = keyof typeof DATA_FILL

export const DATA_PALETTE: readonly DataColor[] = [
  'blue',
  'orange',
  'green',
  'purple',
  'pink',
  'aqua',
  'yellow',
  'red',
  'emerald',
  'navy',
  'beige',
  'forest',
  'gray',
]

const AXIS_TICK = { fill: 'var(--color-fg-subtle)', className: 'type-caption' }

const REFERENCE_LABEL = {
  position: 'top' as const,
  fill: 'var(--color-fg-subtle)',
  className: 'type-caption',
}

export const CHART_ROW_HEIGHT = 260

const BAR_BAND = 38

const MAX_BARS = 8

const MAX_SLICES = 6

const MAX_BAR_SIZE = 22

export function HoursBarChart({
  data,
  ariaLabel,
  color = 'blue',
  tailNoun,
  height,
}: {
  data: ChartDatum[]
  ariaLabel: string
  color?: DataColor
  tailNoun: { one: string; many: string }
  height?: number
}) {
  if (data.length === 0) {
    return <p className="px-2 py-6 text-center type-caption fg-subtle">Sin datos para graficar</p>
  }
  const { shown, tailCount, tailValue } = topRanked(data, MAX_BARS)
  const label =
    tailCount > 0 ? `${ariaLabel}. ${shown.length} principales de ${data.length}` : ariaLabel
  return (
    <div className="flex flex-col gap-2">
      <ChartContainer ariaLabel={label} height={height ?? Math.max(160, shown.length * BAR_BAND)}>
        <BarChart layout="vertical" data={shown} margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
          <CartesianGrid horizontal={false} stroke="var(--color-border-alpha-subtle)" />
          <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} />
          <YAxis
            type="category"
            dataKey="label"
            width={120}
            tick={AXIS_TICK}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ fill: 'var(--color-bg-alpha-subtle-hover)' }}
            content={<ChartTooltipContent hideLabel formatValue={(value) => formatHours(value)} />}
          />
          <Bar dataKey="value" radius={[0, 4, 4, 0]} fill={DATA_FILL[color]} maxBarSize={MAX_BAR_SIZE} />
        </BarChart>
      </ChartContainer>
      <p className="min-h-5 type-caption fg-subtle tabular-nums">
        {tailCount > 0
          ? `+ ${tailCount} ${tailCount === 1 ? tailNoun.one : tailNoun.many} · ${formatHours(tailValue)}`
          : null}
      </p>
    </div>
  )
}

function sliceFill(slice: ChartDatum, index: number): string {
  if (slice.id === OTHER_BUCKET_ID) return DATA_FILL.gray
  return DATA_FILL[DATA_PALETTE[index % DATA_PALETTE.length]]
}

export function DistributionDonut({
  data,
  ariaLabel,
}: {
  data: ChartDatum[]
  ariaLabel: string
}) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  if (data.length === 0) {
    return <p className="px-2 py-6 text-center type-caption fg-subtle">Sin datos para graficar</p>
  }
  const slices = withOtherBucket(data, MAX_SLICES)
  const label =
    slices.length < data.length
      ? `${ariaLabel}. ${slices.length - 1} principales de ${data.length}, el resto agrupado en Otros`
      : ariaLabel
  const activeSlice = activeIndex !== null && activeIndex < slices.length ? activeIndex : null
  return (
    <div className="flex flex-col items-center gap-3">
      <ChartContainer
        ariaLabel={label}
        height={200}
        grain="ring"
        className="[--donut-grain-inner:56px] [--donut-grain-outer:86px]"
      >
        <PieChart>
          <Pie
            data={slices}
            dataKey="value"
            nameKey="label"
            innerRadius={56}
            outerRadius={86}
            paddingAngle={2}
            strokeWidth={0}
            onMouseEnter={(_, index) => setActiveIndex(index)}
            onMouseLeave={() => setActiveIndex(null)}
          >
            {slices.map((slice, index) => (
              <Cell
                key={slice.id}
                fill={sliceFill(slice, index)}
                fillOpacity={activeSlice === null || activeSlice === index ? 1 : 0.4}
              />
            ))}
          </Pie>
          <Tooltip content={<ChartTooltipContent formatValue={(value) => formatHours(value)} />} />
        </PieChart>
      </ChartContainer>
      <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        {slices.map((slice, index) => (
          <span key={slice.id} className="flex items-center gap-1 type-caption fg-subtle">
            <svg viewBox="0 0 8 8" aria-hidden className="size-2 shrink-0">
              <circle cx="4" cy="4" r="4" fill={sliceFill(slice, index)} />
            </svg>
            {slice.label}
          </span>
        ))}
      </div>
    </div>
  )
}

export function TrendLineChart({
  data,
  ariaLabel,
  formatValue = (value) => formatHours(value),
  color = 'green',
}: {
  data: { label: string; value: number }[]
  ariaLabel: string
  formatValue?: (value: number) => string
  color?: DataColor
}) {
  if (data.length === 0) {
    return <p className="px-2 py-6 text-center type-caption fg-subtle">Sin datos para graficar</p>
  }
  return (
    <ChartContainer ariaLabel={ariaLabel} height={200}>
      <LineChart data={data} margin={{ left: 8, right: 16, top: 8, bottom: 4 }}>
        <CartesianGrid vertical={false} stroke="var(--color-border-alpha-subtle)" />
        <XAxis dataKey="label" tick={AXIS_TICK} axisLine={false} tickLine={false} />
        <YAxis tick={AXIS_TICK} axisLine={false} tickLine={false} width={40} />
        <Tooltip content={<ChartTooltipContent formatValue={formatValue} />} />
        <Line
          type="monotone"
          dataKey="value"
          stroke={DATA_FILL[color]}
          strokeWidth={2}
          dot={{ fill: DATA_FILL[color], r: 3 }}
        />
      </LineChart>
    </ChartContainer>
  )
}

export const COHORT_WINDOW = 8

export function CohortRankingChart({
  ranking,
  ariaLabel,
  formatValue,
}: {
  ranking: CohortRanking
  ariaLabel: string
  formatValue: (value: number) => string
}) {
  const label =
    ranking.shown.length < ranking.total
      ? `${ariaLabel}. Posición ${ranking.rank} de ${ranking.total}. Se muestran ${ranking.shown.length} del entorno.`
      : `${ariaLabel}. Posición ${ranking.rank} de ${ranking.total}.`
  return (
    <ChartContainer ariaLabel={label} height={Math.max(160, ranking.shown.length * BAR_BAND)}>
      <BarChart
        layout="vertical"
        data={ranking.shown}
        margin={{ left: 8, right: 16, top: 4, bottom: 4 }}
      >
        <CartesianGrid horizontal={false} stroke="var(--color-border-alpha-subtle)" />
        <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} />
        <YAxis
          type="category"
          dataKey="label"
          width={120}
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: 'var(--color-bg-alpha-subtle-hover)' }}
          content={<ChartTooltipContent hideLabel formatValue={(value) => formatValue(value)} />}
        />
        <ReferenceLine
          x={ranking.median}
          stroke="var(--color-fg-subtle)"
          strokeDasharray="4 4"
          label={{ ...REFERENCE_LABEL, value: `mediana ${formatValue(ranking.median)}` }}
        />
        <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={MAX_BAR_SIZE}>
          {ranking.shown.map((datum) => (
            <Cell
              key={datum.id}
              fill={
                datum.id === ranking.selectedId
                  ? 'var(--color-data-blue-emphasis)'
                  : 'var(--color-data-gray)'
              }
            />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

const AGING_FILL: Record<string, string> = {
  '0-30': 'var(--color-data-neutral)',
  '31-60': 'var(--color-data-warning)',
  '61-90': 'var(--color-data-danger)',
  '90+': 'var(--color-data-danger-emphasis)',
}

export function AgingBarChart({
  data,
  ariaLabel,
  formatValue,
}: {
  data: AgingBucket[]
  ariaLabel: string
  formatValue: (value: number) => string
}) {
  return (
    <ChartContainer ariaLabel={ariaLabel} height={180}>
      <BarChart layout="vertical" data={data} margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke="var(--color-border-alpha-subtle)" />
        <XAxis type="number" tick={AXIS_TICK} axisLine={false} tickLine={false} />
        <YAxis
          type="category"
          dataKey="label"
          width={110}
          tick={AXIS_TICK}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: 'var(--color-bg-alpha-subtle-hover)' }}
          content={<ChartTooltipContent hideLabel formatValue={(value) => formatValue(value)} />}
        />
        <Bar dataKey="amount" radius={[0, 4, 4, 0]} maxBarSize={MAX_BAR_SIZE}>
          {data.map((band) => (
            <Cell key={band.id} fill={AGING_FILL[band.id] ?? AGING_FILL['0-30']} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

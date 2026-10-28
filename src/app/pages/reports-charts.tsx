/**
 * Reportes — chart compositions over the governed Chart chokepoint.
 *
 * Feature-scoped compositions (bar / donut / line) built from
 * `@/app/components/charts`. They own the domain → data-viz token mapping; the
 * primitive stays palette-free. Colors are `var(--color-data-*)` references and
 * axis ticks read `var(--color-fg-subtle)`, per the Chart usage rule. Read-only:
 * charts visualize derived aggregates and never mutate.
 */
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

/**
 * Static `var(--color-data-*)` fill per data tone. The strings are written out in
 * full (never composed as `var(--color-data-${name})`) so Tailwind v4's content
 * scanner sees each token and keeps it in the build. A dynamically composed name
 * is invisible to the scanner, so those `--color-data-*` custom properties get
 * tree-shaken and the fill falls back to black — which is what made most slices
 * render black. Keep these as literal strings.
 */
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

/**
 * Categorical palette order, cycled by index for multi-series charts. Leads with
 * the most distinct vibrant hues so adjacent slices stay legible; the darker /
 * more neutral tones (navy, beige, forest, gray) sit last so they only appear
 * once the vibrant set is exhausted.
 */
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

// Recharts spreads this onto its default tick <Text>, which forwards `className` to the
// SVG <text> — so the size comes from the type scale (`type-caption` = 12/16) instead of a
// raw `fontSize: 12`. `fill` stays a prop because SVG paint is not a Tailwind concern here.
const AXIS_TICK = { fill: 'var(--color-fg-subtle)', className: 'type-caption' }

/**
 * Label style for a reference line, on the same typography token as the axis ticks it sits
 * among. Recharts styles SVG text through props, so this is a module constant carrying a
 * `type-*` class — never an inline `fontSize`, which the typography check rejects.
 */
const REFERENCE_LABEL = {
  position: 'top' as const,
  fill: 'var(--color-fg-subtle)',
  className: 'type-caption',
}

/**
 * Plot height for charts that share a card row, so the row stays flush whatever the
 * dataset holds. Opt in by passing it as `height`: it is what a row of cards needs
 * (all three bottom out together) and what a stacked column does NOT — a drawer
 * chart with two bars would just spread them over dead space.
 */
export const CHART_ROW_HEIGHT = 260

/** Height of one bar's band when the chart sizes itself to its data. */
const BAR_BAND = 38

/** Leading categories a ranking bar chart draws; the rest collapse into the tail caption. */
const MAX_BARS = 8

/** Slices a part-to-whole donut draws, counting the "Otros" residual. */
const MAX_SLICES = 6

/** Bars keep their weight when a series is short, instead of fattening into slabs. */
const MAX_BAR_SIZE = 22

/**
 * Horizontal bar chart of hours, one bar per category (person / client).
 *
 * A ranking, not a part-to-whole: it shows the leading `MAX_BARS` categories and
 * states the rest as a caption. `tailNoun` names what is being counted there.
 */
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
  /** Singular / plural noun for the tail caption ("+ 12 clientes · 84 h"). */
  tailNoun: { one: string; many: string }
  /**
   * Fixed plot height, for charts that must line up with siblings on a card row
   * (pass `CHART_ROW_HEIGHT`). Omit it and the chart sizes to its bars — which is
   * what a chart standing alone in a column wants. The cap bounds it either way.
   */
  height?: number
}) {
  if (data.length === 0) {
    return <p className="px-2 py-6 text-center type-caption fg-subtle">Sin datos para graficar</p>
  }
  const { shown, tailCount, tailValue } = topRanked(data, MAX_BARS)
  // Composed here, not by the caller: only the chart knows what it actually drew, so
  // the spoken label cannot drift from the plot and promise a set it truncated.
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
      {/* The caption row is reserved even when there is no tail, so charts sitting
          side by side in a grid still bottom out together. */}
      <p className="min-h-5 type-caption fg-subtle tabular-nums">
        {tailCount > 0
          ? `+ ${tailCount} ${tailCount === 1 ? tailNoun.one : tailNoun.many} · ${formatHours(tailValue)}`
          : null}
      </p>
    </div>
  )
}

/**
 * Fill for a slice: its categorical hue, except the "Otros" residual, which stays
 * neutral so it reads as "the rest" rather than as another competing category.
 */
function sliceFill(slice: ChartDatum, index: number): string {
  if (slice.id === OTHER_BUCKET_ID) return DATA_FILL.gray
  return DATA_FILL[DATA_PALETTE[index % DATA_PALETTE.length]]
}

/**
 * Donut of how a total splits across categories (task-type distribution).
 *
 * Capped at `MAX_SLICES` with the residual folded into one "Otros" slice, so the
 * ring still sums to the whole. The cap is also what keeps the palette honest: with
 * more categories than hues, the index cycle repeats a color and two categories
 * become indistinguishable.
 */
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
  // Composed here, not by the caller: only the chart knows what it actually drew, so
  // the spoken label cannot drift from the ring and promise a set it truncated.
  const label =
    slices.length < data.length
      ? `${ariaLabel}. ${slices.length - 1} principales de ${data.length}, el resto agrupado en Otros`
      : ariaLabel
  // Guard a stale hover index when the slice array shrinks (period switch): an
  // out-of-range index would dim every slice, so treat it as "none active".
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

/** Line chart of a numeric series across periods (margin or hours evolution). */
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

/** Bars a cohort comparison draws around the selected entity (see `cohortRanking`). */
export const COHORT_WINDOW = 8

/**
 * One entity placed against its cohort on a normalized axis (utilization %, margin %).
 *
 * The selected bar is filled `-emphasis`, its peers neutral gray, and the cohort
 * median is a dashed ReferenceLine — so the reader sees position, spread and centre
 * in one glance without a single figure being tinted (figure-color-restraint: the
 * status lives on the drawer's badge, not on these numbers).
 *
 * The window is centred on the selection by `cohortRanking`, never a top-N, so the
 * selected entity is always drawn. The spoken label carries the TRUE rank, which the
 * window may not show.
 */
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
              // Literal token strings only — a composed var(--color-data-${x}) is
              // invisible to Tailwind v4's scanner and the fill falls back to black.
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

/**
 * Age band → semantic data-state fill: older money is worse money.
 *
 * The hue MEANS the state here, so these are the data-state tokens rather than the
 * categorical palette. Literal strings, for the Tailwind v4
 * scanner — a composed `var(--color-data-${x})` is invisible to it and renders black.
 */
const AGING_FILL: Record<string, string> = {
  '0-30': 'var(--color-data-neutral)',
  '31-60': 'var(--color-data-warning)',
  '61-90': 'var(--color-data-danger)',
  '90+': 'var(--color-data-danger-emphasis)',
}

/**
 * How overdue a bucket's money is, by age band (the Finanzas Estado drawer).
 *
 * A part-to-whole of one bucket's overdue total, so every band is drawn — including the
 * empty ones, which keeps the axis stable across periods instead of growing and shrinking
 * with the data. `agingBuckets` guarantees the four bands and their order.
 */
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

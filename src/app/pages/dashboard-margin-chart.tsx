/**
 * Dashboard — client-margin bar chart, a feature composition over the governed Chart
 * chokepoint (`@/app/components/charts`). Per the convention a feature
 * composition is not a governed artifact; it owns the domain → data-viz token mapping and
 * the primitive stays palette-free.
 *
 * Why not `HoursBarChart`: that one hardcodes `formatHours` in its tooltip and its tail
 * caption, demands an hours-shaped `tailNoun`, paints every bar one hue, and rounds its
 * corners for a bar that only ever grows rightward. A margin is a percentage that reaches
 * -181%, so it needs a zero baseline, a domain that survives an outlier, and a fill that
 * says which side of zero it is on. Generalizing HoursBarChart would have touched its four
 * live call sites for no gain.
 */
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

/**
 * Band → data-STATE fill. The hue MEANS the state here (a losing client is not merely
 * "another category"), so these are the data-state tokens, not the categorical palette
 *. This is also what carries the meaning the band `Badge`
 * used to carry beside each row: the bar says Saludable / Estable / Bajo by itself.
 *
 * Literal token strings only — a composed `var(--color-data-${band})` is invisible to
 * Tailwind v4's content scanner, so the custom property is tree-shaken and the bar renders
 * BLACK. This repo has already been bitten by that (see `reports-charts.tsx`).
 */
const BAND_FILL: Record<MarginBand, string> = {
  high: 'var(--color-data-success)',
  medium: 'var(--color-data-neutral)',
  low: 'var(--color-data-danger)',
}

// Recharts spreads this onto its default tick <Text>, which forwards `className` to the SVG
// <text> — so the size comes from the type scale, never a raw `fontSize` (which the
// typography check rejects). Axis ticks are Tertiary orientation data: quiet by rank.
const AXIS_TICK = { fill: 'var(--color-fg-subtle)', className: 'type-caption' }

/** Height of one bar's band, so both cards bottom out together on the same client count. */
const BAR_BAND = 40

/** Bars keep their weight when a series is short, instead of fattening into slabs. */
const MAX_BAR_SIZE = 20

/**
 * Headroom beyond the data, as a share of its span. `TRAIL` is the side behind the baseline,
 * where nothing is drawn; the LEAD side is where the bars grow, and therefore where every
 * value label lands.
 *
 * The lead headroom scales with the label's LENGTH, and that is the whole point. A label is
 * measured in pixels while a domain is measured in data units, so a flat share of the span
 * buys fewer pixels the narrower the plot gets. A flat 30% cleared "-181%" at 1440px and
 * still let it land on top of its own client's name at 1280px, where `PanelGroup
 * inlineAt="xl"` squeezes the section — measured, both times. Widening it until the widest
 * label fits is what makes it hold at every width instead of at the one that was checked.
 */
const TRAIL_HEADROOM = 0.05
const LEAD_HEADROOM_BASE = 0.1
const LEAD_HEADROOM_PER_CHAR = 0.065

/**
 * Value-axis domain, always anchored at zero.
 *
 * Recharts' default domain fits the data, which for an all-negative series would push the
 * baseline off-plot and quietly turn a set of losses into what reads as a normal ranking.
 * Zero is the whole point of this chart, so it is always in frame.
 *
 * The headroom is asymmetric because the labels are: bars grow away from zero, so on a
 * losing ranking every label sits at the LEFT tip and only the left end needs room, while
 * on a healthy one they all sit at the right tip. Padding both ends equally would waste
 * half the plot on the side nothing is drawn on.
 */
function valueDomain(values: number[], widestLabel: number): [number, number] {
  const min = Math.min(0, ...values)
  const max = Math.max(0, ...values)
  const span = Math.max(1, max - min)
  const lead = span * (LEAD_HEADROOM_BASE + LEAD_HEADROOM_PER_CHAR * widestLabel)
  const trail = span * TRAIL_HEADROOM
  return [min - (min < 0 ? lead : trail), max + (max > 0 ? lead : trail)]
}

/**
 * Horizontal bars of per-client margin, one bar per client, read against a zero baseline.
 *
 * The value is printed on every bar. That is not decoration: the convention requires a
 * signal other than colour, and without it a reader who cannot separate the green from the
 * red has only bar length — which, across two cards with independent domains, is not
 * comparable.
 */
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

  // `ChartContainer` exposes its chart to assistive tech as ONE labelled image (`role="img"`),
  // which makes the SVG a leaf: the client names and percentages inside it reach no screen
  // reader. That is fine for a chart that was always a chart — but this one REPLACED a list
  // of clients that read perfectly well, so a bare "Mejor margen" would be a straight
  // regression: the reader would be told a ranking exists and never told what is in it. The
  // label therefore carries the ranking itself, which is the only copy of this data any
  // assistive tech will get.
  const spokenLabel = `${ariaLabel}: ${data
    .map((datum) => `${datum.label} ${formatPercent(datum.value)}`)
    .join(', ')}`

  return (
    <ChartContainer ariaLabel={spokenLabel} height={Math.max(120, data.length * BAR_BAND)}>
      <BarChart layout="vertical" data={data} margin={{ left: 0, right: 4, top: 4, bottom: 4 }}>
        {/* The value axis is HIDDEN, not absent: it still owns the scale and the zero-anchored
            domain, but it draws no ticks. A percent scale under three bars is noise the reader
            never uses — every bar already prints its own value, which is the signal
            the convention requires, and the dashed baseline says where zero is. */}
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
        {/* The baseline a negative margin is read against. Same stroke/dash convention as the
            projection chart's zero line, so "this is zero" looks the same product-wide. */}
        <ReferenceLine x={0} stroke="var(--color-fg-subtle)" strokeDasharray="4 4" />
        {/* A uniform radius, NOT the `[0, 4, 4, 0]` used elsewhere: that array rounds the
            right-hand corners, which are the OUTER corners only for a bar growing rightward.
            A negative bar grows left, so it would get its rounding on the end joined to the
            baseline and a hard edge at its tip — backwards. */}
        <Bar dataKey="value" radius={2} maxBarSize={MAX_BAR_SIZE}>
          {data.map((datum) => (
            <Cell key={datum.id} fill={BAND_FILL[datum.band]} />
          ))}
          {/* `right` reads as "outside the bar, past its tip" for BOTH signs: Recharts places
              the label beyond the END OF THE VALUE, so a positive bar gets it past its right
              tip and a NEGATIVE bar gets it past its LEFT tip — away from zero, not on the
              baseline. That is precisely why `valueDomain` reserves its headroom on the side
              the bars grow toward: without it, a negative label lands on the client's own name
              in the Y axis (measured at 1280px). Do not "simplify" that headroom away on the
              assumption these labels sit near zero — they do not. */}
          <LabelList
            dataKey="value"
            position="right"
            className="type-caption tabular-nums"
            fill="var(--color-fg-default)"
            // Recharts types a label's value as RenderableText (it can hand back a string or
            // nothing at all), so coerce rather than assert: a bar with no value prints no
            // label instead of "NaN%".
            formatter={(value: unknown) =>
              typeof value === 'number' ? formatPercent(value) : ''
            }
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  )
}

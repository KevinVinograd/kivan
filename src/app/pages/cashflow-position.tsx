import { cn } from '@/app/lib/utils'
import {
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/app/components/components'
import { SectionAccordionCard, SectionHeader } from '@/app/components/templates'
import type { Currency, Money } from './treasury-mock-data'
import { CURRENCIES, laneAmount } from './treasury-position'
import {
  formatLaneAmount,
  LANE_LABEL,
  rowLane,
  type PositionModel,
  type PositionRow,
  type PositionSection,
} from './treasury-position-view'

/**
 * Per-lane composition-bar hues (one color per currency, three shades for the
 * Saldos / a cobrar / a pagar components). The two inflows that ADD to the cash
 * position (Saldos, a cobrar) carry the lane's own color — ARS aqua/celeste, USD
 * emerald. The outflow that
 * SUBTRACTS from it (a pagar) is red across every lane, so add-vs-subtract reads at
 * a glance. Data-palette tokens, theme-safe. Segment widths are same-currency
 * magnitudes, so they are always comparable — no cross-lane conversion is implied.
 */
type LaneShade = { bg: string; fill: string }
const RESTA_SHADE: LaneShade = { bg: 'bg-data-red', fill: 'text-data-red' }
const LANE_HUE: Record<Currency, { saldos: LaneShade; cobrar: LaneShade; pagar: LaneShade }> = {
  ARS: {
    saldos: { bg: 'bg-data-aqua-emphasis', fill: 'text-data-aqua-emphasis' },
    cobrar: { bg: 'bg-data-aqua', fill: 'text-data-aqua' },
    pagar: RESTA_SHADE,
  },
  USD: {
    saldos: { bg: 'bg-data-emerald-emphasis', fill: 'text-data-emerald-emphasis' },
    cobrar: { bg: 'bg-data-emerald', fill: 'text-data-emerald' },
    pagar: RESTA_SHADE,
  },
}

/**
 * Right-aligned lane cells (ARS / USD). Row cells dash an absent lane
 * for noise reduction; total / summary cells pass `dashAbsent={false}` so a real
 * figure (including a meaningful 0 or a negative position) always shows.
 */
function LaneCells({
  money,
  strong = false,
  dashAbsent = true,
  danger = false,
}: {
  money: Money
  strong?: boolean
  dashAbsent?: boolean
  danger?: boolean
}) {
  return (
    <>
      {CURRENCIES.map((currency) => {
        const present = money[currency] != null
        const value = laneAmount(money, currency)
        return (
          <TableCell
            key={currency}
            className={cn(
              'text-right align-top tabular-nums',
              strong ? 'font-medium fg-default' : 'fg-default',
              danger && value < 0 ? 'fg-danger' : undefined,
            )}
          >
            {dashAbsent && !present ? (
              <span className="fg-subtle">-</span>
            ) : (
              formatLaneAmount(value, currency)
            )}
          </TableCell>
        )
      })}
    </>
  )
}

/** Right-aligned lane column headers (ARS / USD). */
function LaneHeaders() {
  return (
    <>
      {CURRENCIES.map((currency) => (
        <TableHead key={currency} className="text-right">
          {LANE_LABEL[currency]}
        </TableHead>
      ))}
    </>
  )
}

/** Compact per-lane summary shown in a collapsed section's accordion trigger:
 *  the present lanes only, with a negative lane flagged danger so a cash crunch
 *  stays visible without expanding the card. */
function LaneSummary({ money }: { money: Money }) {
  // Only present lanes are shown; a non-empty section whose lanes net to exactly 0
  // (sumMoney omits zero-sum lanes) still carries a real total, so fall back to an
  // explicit zero rather than rendering nothing. Callers only invoke this for a
  // section that has rows or for the Posición breakdown, so an empty lane set
  // unambiguously means "all lanes zero".
  const lanes = CURRENCIES.filter((currency) => money[currency] != null)
  // Pin the per-lane totals to `type-body-2`: the trigger that hosts this summary
  // uses `emphasis="section"` (type-section), and these amount spans would
  // otherwise inherit that larger/bolder scale — only the section title should be
  // promoted, not its inline figure.
  return (
    <span className="flex flex-wrap items-center justify-end gap-x-4 gap-y-0.5 type-body-2 tabular-nums">
      {lanes.length === 0 ? (
        <span>{formatLaneAmount(0, 'ARS')}</span>
      ) : (
        lanes.map((currency) => {
          const value = laneAmount(money, currency)
          return (
            <span key={currency} className={cn(value < 0 ? 'fg-danger' : undefined)}>
              {formatLaneAmount(value, currency)}
            </span>
          )
        })
      )}
    </span>
  )
}

/** A single position row: label + context, with installment / reintegro / observation
 *  sub-lines for the manual salary pendientes, then its per-lane amounts. */
function PositionRowView({ row }: { row: PositionRow }) {
  // `undefined` when the row's money is in a lane this build does not know, in which case
  // the sub-lines are omitted rather than printed in a lane nothing can name. The rule and
  // its reasoning live in `treasury-position-view`, where a test can reach them.
  const lane = rowLane(row.balances)
  return (
    <TableRow>
      <TableCell className="align-top">
        <div className="flex flex-col gap-0.5">
          <span className="type-body-2 fg-default">{row.label}</span>
          {row.detail ? <span className="type-caption fg-subtle">{row.detail}</span> : null}
          {lane
            ? row.installments?.map((installment, index) => (
                <span key={index} className="type-caption fg-subtle">
                  A cuenta {installment.dateLabel}: {formatLaneAmount(installment.amount, lane)}
                </span>
              ))
            : null}
          {lane && row.reimbursement ? (
            <span className="type-caption fg-warning">
              Reintegro: {formatLaneAmount(row.reimbursement.amount, lane)}
              {row.reimbursement.note ? ` (${row.reimbursement.note})` : ''}
            </span>
          ) : null}
          {row.observations ? (
            <span className="type-caption fg-subtle">{row.observations}</span>
          ) : null}
        </div>
      </TableCell>
      <LaneCells money={row.balances} />
    </TableRow>
  )
}

/**
 * A collapsible titled section card (Saldos / pendientes / reserva). The trigger
 * carries the title plus a per-lane total summary, so a collapsed card still reads
 * as a one-line figure; expanding reveals the per-row detail under flag headers.
 */
function SectionCard({
  title,
  section,
  emptyHint,
}: {
  title: string
  section: PositionSection
  emptyHint: string
}) {
  const isEmpty = section.rows.length === 0
  return (
    <div className="px-4 md:px-6 lg:px-8 desktop:px-10">
      <SectionAccordionCard
        title={title}
        summary={isEmpty ? undefined : <LaneSummary money={section.total} />}
        contentInset={false}
      >
        {isEmpty ? (
          <p className="px-2 type-caption fg-subtle">{emptyHint}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead />
                <LaneHeaders />
              </TableRow>
            </TableHeader>
            <TableBody>
              {section.rows.map((row) => (
                <PositionRowView key={row.id} row={row} />
              ))}
            </TableBody>
          </Table>
        )}
      </SectionAccordionCard>
    </div>
  )
}

/** The collapsible "cómo se compone" breakdown: Saldos + a cobrar - a pagar =
 *  Posición, per lane. The trigger previews the resulting Posición. */
function PositionBreakdown({ model }: { model: PositionModel }) {
  const rows: { label: string; money: Money; strong?: boolean; danger?: boolean }[] = [
    { label: 'Total saldos', money: model.saldos.total },
    { label: 'Cobranzas a recibir', money: model.ingresosPendientes.total },
    { label: 'Pagos pendientes', money: model.egresosPendientes.total },
    { label: 'Posición', money: model.posicion, strong: true, danger: true },
  ]
  return (
    <div className="px-4 md:px-6 lg:px-8 desktop:px-10">
      <SectionAccordionCard
        title="Cómo se compone"
        summary={<LaneSummary money={model.posicion} />}
        contentInset={false}
      >
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead />
              <LaneHeaders />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.label}>
                <TableCell className={cn(row.strong ? 'font-medium fg-default' : 'fg-default')}>
                  {row.label}
                </TableCell>
                <LaneCells money={row.money} strong={row.strong} dashAbsent={false} danger={row.danger} />
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SectionAccordionCard>
    </div>
  )
}

/**
 * One currency lane's position as a stacked composition bar: each component's signed
 * contribution to the Posición (Saldos + a cobrar add, a pagar subtracts), sized by
 * absolute magnitude (same currency, so comparable) and shaded in the lane's hue —
 * anything that reduces the position takes the resta colour. Shows the net Posición
 * figure and a per-component legend. No cross-currency total is implied — each lane
 * is its own bar.
 */
function PositionLaneBar({ currency, model }: { currency: Currency; model: PositionModel }) {
  const hue = LANE_HUE[currency]
  // Signed contribution of each component to the lane's Posición (saldos + a cobrar
  // - a pagar). A negative contribution reduces the position, so it takes the resta
  // colour regardless of which component it is (a pagar always, or an overdrawn
  // negative saldos); widths are absolute magnitudes, so the bar always reconciles
  // with the headline figure and no part is silently dropped.
  const parts = [
    { key: 'saldos', label: 'Saldos', contribution: laneAmount(model.saldos.total, currency), shade: hue.saldos },
    { key: 'cobrar', label: 'A cobrar', contribution: laneAmount(model.ingresosPendientes.total, currency), shade: hue.cobrar },
    { key: 'pagar', label: 'A pagar', contribution: -laneAmount(model.egresosPendientes.total, currency), shade: hue.pagar },
  ]
    .map((part) => ({ ...part, shade: part.contribution < 0 ? RESTA_SHADE : part.shade }))
    .filter((part) => part.contribution !== 0)
  const totalMagnitude = parts.reduce((sum, part) => sum + Math.abs(part.contribution), 0)
  const posicion = laneAmount(model.posicion, currency)

  // Cumulative x offsets so the segments stack left-to-right. Widths are SVG
  // presentation attributes (0–100, sized within one currency so comparable), not
  // inline style, per `react/forbid-dom-props` — same technique as Progress.
  let offset = 0
  const segments = parts.map((part) => {
    const width = totalMagnitude > 0 ? (Math.abs(part.contribution) / totalMagnitude) * 100 : 0
    const segment = { key: part.key, x: offset, width, fill: part.shade.fill }
    offset += width
    return segment
  })

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-4">
        <span className="type-caption fg-subtle">{LANE_LABEL[currency]}</span>
        <span className={cn('type-metric-2 tabular-nums', posicion < 0 ? 'fg-danger' : 'fg-default')}>
          {formatLaneAmount(posicion, currency)}
        </span>
      </div>
      {parts.length === 0 ? (
        <span className="type-caption fg-subtle">Sin movimientos</span>
      ) : (
        <>
          <div className="h-3 w-full overflow-hidden rounded-full bg-alpha-subtle">
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="block h-full w-full"
              aria-hidden
            >
              {segments.map((segment) => (
                <rect
                  key={segment.key}
                  x={segment.x}
                  y="0"
                  height="100"
                  width={segment.width}
                  fill="currentColor"
                  className={segment.fill}
                />
              ))}
              {/* 1px separators between segments. `vector-effect=non-scaling-stroke`
                  keeps them a constant 1 device pixel under the non-uniform viewBox
                  scale; the card surface colour reads as a gap. */}
              {segments.slice(1).map((segment) => (
                <line
                  key={`gap-${segment.key}`}
                  x1={segment.x}
                  y1="0"
                  x2={segment.x}
                  y2="100"
                  strokeWidth={1}
                  vectorEffect="non-scaling-stroke"
                  className="stroke-surface-flat"
                />
              ))}
            </svg>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {parts.map((part) => (
              <span key={part.key} className="inline-flex items-center gap-1.5 type-caption fg-subtle">
                <span className={cn('size-2 shrink-0 rounded-full', part.shade.bg)} aria-hidden />
                {part.label}
                <span className={cn('tabular-nums', part.contribution < 0 ? 'fg-danger' : 'fg-default')}>
                  {formatLaneAmount(part.contribution, currency)}
                </span>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/**
 * Unified Posición card: the composition of each currency lane's position as a
 * stacked bar. One card, one bar per present lane (ARS always; other lanes when they
 * carry a balance / pendiente). Currencies are never summed into a single figure.
 */
function PositionCompositionCard({ model }: { model: PositionModel }) {
  const lanes = CURRENCIES.filter(
    (currency) =>
      currency === 'ARS' ||
      laneAmount(model.saldos.total, currency) !== 0 ||
      laneAmount(model.ingresosPendientes.total, currency) !== 0 ||
      laneAmount(model.egresosPendientes.total, currency) !== 0,
  )
  return (
    <div className="flex flex-col">
      <SectionHeader title="Composición de la posición" inset={false} />
      <Card>
        <CardContent className="flex flex-col gap-5">
          {lanes.map((currency) => (
            <PositionLaneBar key={currency} currency={currency} model={model} />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

/** Total wealth (reserva + posición), shown full-width at the bottom of the snapshot
 *  as a flat (outlined) result line: the label on the left and the per-lane totals
 *  right-aligned. Multi-lane, so it is a bespoke layout rather than a KpiTile. */
function PatrimonioTile({ model }: { model: PositionModel }) {
  const lanes = CURRENCIES.filter((currency) => laneAmount(model.patrimonio, currency) !== 0)
  return (
    <Card variant="outlined">
      <CardContent className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1">
        <span className="type-caption fg-subtle">Patrimonio total</span>
        <div className="flex flex-wrap items-baseline justify-end gap-x-6 gap-y-1">
          {lanes.length === 0 ? (
            <span className="type-section fg-default tabular-nums">{formatLaneAmount(0, 'ARS')}</span>
          ) : (
            lanes.map((currency) => (
              <span key={currency} className="type-section fg-default tabular-nums">
                {formatLaneAmount(laneAmount(model.patrimonio, currency), currency)}
                <span className="type-caption fg-subtle">
                  {' '}
                  {LANE_LABEL[currency]}
                </span>
              </span>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Posición tab — the treasury position snapshot, a faithful mirror of the account
 * administrator's sheet. The top card shows each currency lane's position as a
 * composition bar (Saldos / a cobrar / a pagar in the lane's hue); below it sit the
 * collapsible detail sections (operating Saldos, Ingresos/Egresos pendientes, the
 * Cómo se compone breakdown, and the Finanzas Hold / Reserva), and finally the total
 * patrimonio. Currency lanes (ARS / USD) are shown side by side and never
 * converted into each other. All figures come from the pure `treasury-position-view`
 * model; this file only composes approved components and maps tones to tokens.
 */
export function CashflowPosition({ model }: { model: PositionModel }) {
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="px-4 md:px-6 lg:px-8 desktop:px-10">
        <PositionCompositionCard model={model} />
      </div>

      <SectionCard
        title="Saldos"
        section={model.saldos}
        emptyHint="No hay cuentas operativas cargadas."
      />
      <SectionCard
        title="Ingresos pendientes"
        section={model.ingresosPendientes}
        emptyHint="No hay cobranzas pendientes."
      />
      <SectionCard
        title="Egresos pendientes"
        section={model.egresosPendientes}
        emptyHint="No hay pagos pendientes."
      />

      <PositionBreakdown model={model} />

      <SectionCard
        title="Finanzas Hold / Reserva"
        section={model.reserva}
        emptyHint="No hay cuentas de reserva cargadas."
      />

      <div className="px-4 md:px-6 lg:px-8 desktop:px-10">
        <PatrimonioTile model={model} />
      </div>
    </div>
  )
}

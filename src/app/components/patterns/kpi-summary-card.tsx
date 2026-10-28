import { type ReactNode } from 'react'

import { cn } from '@/app/lib/utils'
import { AFFORDANCE } from '@/app/lib/icon-registry'
import { useKpiDensity } from '@/app/lib/use-kpi-density'
import { Card, CardContent, IconButton, Separator, Skeleton } from '@/app/components/components'

// ── Figure contract ──────────────────────────────────────────────────────────

export type KpiTone = 'default' | 'success' | 'danger' | 'warning'

/** Single source of truth for KPI tone -> foreground token across every surface. */
export const KPI_TONE_FG: Record<KpiTone, string> = {
  default: 'fg-default',
  success: 'fg-success',
  danger: 'fg-danger',
  warning: 'fg-warning',
}

/**
 * Is this figure a ZERO — whatever currency, locale or notation produced it?
 *
 * A zero KPI renders `fg-subtle` rather than `fg-default`: nothing happened in that lane /
 * that column this period, and a figure as loud as a real number makes an operator scan a
 * row of nothings at full weight before reaching the one that carries money. It also
 * settles an ambiguity the lane pair introduced — an always-present `US$ 0` beside a peso
 * total reads as "nothing here" when it is quiet, where at full weight it read as an
 * assertion about what is owed. A zero also drops any `tone` it declared: nothing overdue
 * is not an alarm.
 *
 * `fg-subtle`, NOT `fg-disabled`, and the difference is not cosmetic. `fg-disabled`
 * (`--ink-700`) is one ramp step lighter and FAILS the WCAG minimum contrast ratio on this
 * surface, which is exactly why the convention
 * reserved that token for disabled controls in the first place: an inactive control is
 * exempt from the contrast requirement (WCAG 1.4.3), and a money figure is not a control.
 * `fg-subtle` is the sanctioned quieter neutral and it passes.
 *
 * IT WORKS ON THE FORMATTED STRING, and that is deliberate. `value` is pre-formatted by
 * the caller (the card never formats), so the raw number is not available here; adding a
 * `zero` flag to `Kpi` would put the decision back in every builder, which is exactly the
 * class of "one screen remembered, the next did not" drift this repo keeps paying for.
 * Stripping to digits is robust across the shapes the app produces: `$ 0`, `US$ 0`,
 * `$ 0,0` (a CI ICU variant), a bare `0`, and `$ 12.850.000` / `$ 0,5` correctly do NOT
 * match. A value with no digits at all (`-`, `Sin registro`) is not a zero either.
 */
function isZero(value: string): boolean {
  const digits = value.replace(/\D/g, '')
  return digits.length > 0 && !/[1-9]/.test(digits)
}

/** Optional compare delta under a figure. `positive` drives the tone independently of
 *  sign, because "lower is better" for some metrics (egresos); `null` is neutral. */
export type KpiDelta = { label: string; positive: boolean | null }

const DELTA_FG = {
  positive: 'fg-success',
  negative: 'fg-danger',
  neutral: 'fg-subtle',
} as const

function deltaClass(delta: KpiDelta): string {
  if (delta.positive === null) return DELTA_FG.neutral
  return delta.positive ? DELTA_FG.positive : DELTA_FG.negative
}

export type Kpi = {
  id: string
  label: string
  value: string
  /** Figure tint. Defaults to `default` — a figure is only tinted when the NUMBER
   *  itself is the status. */
  tone?: KpiTone
  /** Secondary caption under the figure (counts / context). Suppressed in dense. */
  hint?: string
  /** Compare delta under the figure. Wins over `hint`. Suppressed in dense. */
  delta?: KpiDelta | null
  /** A Tertiary orientation figure (e.g. a `Períodos` count): it stays quiet
   *  (`type-body-2` + `fg-subtle`) even inside a hero card's supporting grid, so it
   *  never reads as a supporting KPI. */
  tertiary?: boolean
}

// ── Supporting grid ──────────────────────────────────────────────────────────

/** Static column classes, keyed by figure count so Tailwind's scanner keeps them. The
 *  grid sizes to the number of supporting figures so a short strip (2-3) never clusters
 *  at the left of a wide grid. */
const SUPPORTING_GRID_COLS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-2 sm:grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-4',
  5: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
  // Six figures deliberately do NOT reach for a 6-column row: they read as two rows of
  // three. Falling through to the 5-column default would strand a lone sixth figure.
  6: 'grid-cols-2 sm:grid-cols-3',
}

function supportingGridCols(count: number): string {
  return SUPPORTING_GRID_COLS[count] ?? 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5'
}

// ── Figure block ─────────────────────────────────────────────────────────────

/**
 * One label + figure (+ sub-line) block. `figureToken` carries the tier, which in dense
 * is a responsive pair (`type-metric md:type-metric-2`) because dense only takes effect
 * from `md` up — see the density note on `KpiSummaryCard`.
 */
function KpiFigureBlock({
  kpi,
  figureToken,
  hideSubLineAtMd,
}: {
  kpi: Kpi
  figureToken: string
  hideSubLineAtMd: boolean
}) {
  // A figure slot holding PROSE — letters, no digits ("No disponible", "Sin datos") — is
  // an empty-state message, not a figure: rendering it at 32px or 52px overflows the slot,
  // so it steps down to a quiet label. A SYMBOLIC placeholder ("…" while a query is in
  // flight, "-" on error) is still the figure, and it must KEEP its tier — downgrading it
  // would collapse the hero on every load and jump the layout when the value lands.
  const isEmptyStateProse = /\p{L}/u.test(kpi.value) && !/\d/.test(kpi.value)

  const valueClass = kpi.tertiary
    ? 'type-body-2 tabular-nums fg-subtle'
    : isEmptyStateProse
      ? // The step-down drops the SIZE, never the MEANING. A prose value that carries a
        // declared tone is a status the reader must still see ("Pendiente" in `fg-warning`);
        // only an untoned empty state ("No disponible") goes quiet.
        cn('type-section tabular-nums', kpi.tone ? KPI_TONE_FG[kpi.tone] : 'fg-subtle')
      : cn(figureToken, 'tabular-nums', isZero(kpi.value) ? 'fg-subtle' : KPI_TONE_FG[kpi.tone ?? 'default'])

  return (
    <div className="flex flex-col gap-1">
      {/* A card whose section header already names the figure passes `label: ''` and gets no
          caption — an empty caption would open a 16px gap above the figure for nothing. */}
      {kpi.label ? <span className="type-caption fg-subtle">{kpi.label}</span> : null}
      <span className={valueClass}>{kpi.value}</span>
      {kpi.delta ? (
        <span
          className={cn('type-caption tabular-nums', deltaClass(kpi.delta), hideSubLineAtMd && 'md:hidden')}
        >
          {kpi.delta.label}
        </span>
      ) : kpi.hint ? (
        <span className={cn('type-caption fg-subtle', hideSubLineAtMd && 'md:hidden')}>{kpi.hint}</span>
      ) : null}
    </div>
  )
}

// ── Density toggle ───────────────────────────────────────────────────────────

/**
 * The floating collapse/expand control. It is revealed on card hover and on keyboard
 * focus (`group-focus-within`), and stays permanently visible on coarse pointers, which
 * have no hover to reveal it. Hidden below `md` because dense has no effect there.
 */
function KpiDensityToggle({ isDense, onToggle }: { isDense: boolean; onToggle: () => void }) {
  const Icon = isDense ? AFFORDANCE.expand : AFFORDANCE.collapseValue
  return (
    <IconButton
      variant="transparent"
      size="dense"
      // `standard` (not the IconButton default `press`) because this button's motion IS
      // the opacity reveal: only `motion-standard` transitions opacity, and a second
      // motion class would not merge with it — the two `transition` declarations compete.
      motion="standard"
      aria-label={isDense ? 'Expandir tarjeta' : 'Contraer tarjeta'}
      aria-expanded={!isDense}
      onClick={onToggle}
      className={cn(
        'absolute top-2 right-2 z-10 hidden md:flex',
        'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 pointer-coarse:opacity-100',
      )}
    >
      <Icon aria-hidden />
    </IconButton>
  )
}

// ── Card ─────────────────────────────────────────────────────────────────────

export type KpiSummaryCardProps = {
  /** The figures, in reading order. The hero is picked by id, never by position. */
  figures: Kpi[]
  /**
   * Names the focal figure. `null` opts the card out of a hero entirely (a governed
   * choice for a card that shares a viewport with another card's hero); anything
   * unmatched falls back to the first figure.
   *
   * A TWO-ID TUPLE renders both as heroes, side by side at `type-metric`. That is the
   * sanctioned exception: two co-visible
   * `type-metric` figures ONLY when both are genuinely Primary in the page-context § 6 —
   * "two protagonists the view exists to compare side by side" — and demoting either
   * would lose the view's meaning. The lane pairs on /cobros, /pagos and /billing are
   * that case: a peso total and a dollar total for one period, which are never summed
   * and so must be read together or not at all.
   *
   * The TUPLE is why the type is not `string[]`. That rule's ceiling is a hard two, and
   * a hard ceiling belongs in the compiler rather than in a reviewer's memory: a third
   * hero does not type-check, so it cannot reach a screen and be argued about later.
   */
  heroId?: string | [string, string] | null
  /** Tier of the non-hero figures. Explicit, never derived from hero presence:
   *  a hero-less card may still carry `type-metric-2` supporting figures. */
  supportingToken?: 'type-metric-2' | 'type-section'
  /** An element that belongs to the figures and reads BELOW them — a `Progress` bar for a
   *  completion hero, a legend. It sits under the supporting grid and above `actions`.
   *  Not a place for controls: those are `actions`. */
  footer?: ReactNode
  /** Primary actions for the record, attached below the figures they act on. */
  actions?: ReactNode
  /** The author's default density. Dense drops the 52px hero to `type-metric-2` (32px)
   *  and the supporting figures to `type-headline` (24px) on one row. */
  dense?: boolean
  /** Renders the floating collapse/expand toggle. */
  collapsible?: boolean
  /** Persists the reader's density choice for this card across reloads. */
  storageKey?: string
  /**
   * Rules a `Separator` between the hero and the supporting grid, so the focal figure
   * reads as its own block rather than as the first item of the list under it. Opt-in:
   * most summary cards carry few enough supporting figures that the size ramp alone
   * separates them, and a rule there would just be more ink.
   *
   * A no-op unless the card actually has BOTH a hero and supporting figures, and it is
   * dropped from `md` up in `dense` — dense lays the figures out as one baseline-aligned
   * ROW there, where a horizontal rule would cut the row in half.
   */
  dividedHero?: boolean
}

/**
 * The single summary-card shape: the §6 focal figure as a full-width `type-metric`
 * (52px) hero, then the remaining figures as a `type-metric-2` (32px) supporting grid.
 * Balanced by construction — never a row of separate tiles with mismatched sizes.
 *
 * DENSE. The compact form steps every figure one rung down the ramp — hero 52 -> 32
 * (`type-metric-2`), supporting 32 -> 24 (`type-headline`) — and lays them out on a
 * single row, dropping the hint/delta sub-lines. Because it carries no `type-metric`,
 * a dense card spends no hero budget: it is the sanctioned way to put a second summary
 * card in a viewport that already has a hero.
 *
 * Dense takes effect from `md` up only. Below `md` the two dense tiers would both
 * resolve to 24px (`type-metric-2` bottoms out there, `type-headline` is flat), so the
 * hierarchy would tie — the card renders its comfortable form instead.
 *
 * PADDING IS CALLER-OWNED. The card renders no page gutter; the page that hosts it
 * already pads, and the two page ramps in this product are irreconcilable.
 */
export function KpiSummaryCard({
  figures,
  heroId,
  supportingToken = 'type-metric-2',
  footer,
  actions,
  dense = false,
  collapsible = false,
  storageKey,
  dividedHero = false,
}: KpiSummaryCardProps) {
  const { isDense, toggleDense } = useKpiDensity({ dense, storageKey })

  // `null` means no hero. A PAIR resolves each id on its own and keeps what matched, so an
  // unmatched second id degrades to one hero — the safe direction, since a lookup miss can
  // then never push the card past the co-visibility ceiling. Anything else (one id, or the
  // prop omitted) keeps the long-standing behaviour: the named figure, else the first.
  const heroes = ((): Kpi[] => {
    if (heroId === null) return []
    if (Array.isArray(heroId)) {
      const matched = heroId.map((id) => figures.find((figure) => figure.id === id))
      // Deduped: the same id twice would otherwise render one figure as two heroes.
      return [...new Set(matched.filter((figure): figure is Kpi => figure != null))]
    }
    const named = figures.find((figure) => figure.id === heroId) ?? figures[0]
    return named ? [named] : []
  })()
  const rest = figures.filter((figure) => !heroes.includes(figure))
  if (heroes.length === 0 && rest.length === 0) return null

  // Nothing to divide unless the hero has a supporting grid under it to be divided FROM.
  const showHeroDivider = dividedHero && heroes.length > 0 && rest.length > 0

  const heroToken = isDense ? 'type-metric md:type-metric-2' : 'type-metric'
  const restToken = isDense ? `${supportingToken} md:type-headline` : supportingToken

  return (
    <Card className={cn('relative', collapsible && 'group')}>
      {collapsible ? <KpiDensityToggle isDense={isDense} onToggle={toggleDense} /> : null}
      <CardContent
        className={cn(
          // `items-baseline-last` aligns each block's LAST baseline — which is the figure,
          // since the sub-lines are hidden in dense. The 24px supporting figures therefore
          // sit on the SAME baseline as the 32px hero and the row reads as one optical line
          // of data. Plain `items-baseline` would align the FIRST baseline (the captions),
          // leaving the figures floating at different heights.
          isDense &&
            'flex flex-col gap-2 md:flex-row md:flex-wrap md:items-baseline-last md:gap-x-8 md:gap-y-3',
          // The toggle floats over the content box's top-right corner. The dense row packs
          // figures left-to-right with no right inset, so at the widths where the row wraps
          // near that corner a caption slides under the button. Reserve the button's column
          // (32px + its 8px inset) so nothing can. Comfortable needs no reservation: its
          // supporting grid sits BELOW the hero, clear of the button's reach.
          isDense && collapsible && 'md:pr-10',
        )}
      >
        {heroes.length > 0 ? (
          // One hero keeps the full-width block it has always had. A PAIR splits into two
          // equal columns from `sm` up and stacks below it: two 52px figures side by side
          // on a phone leave neither enough width, and stacked they still read as one tier
          // because the token is what carries the rank, not the position.
          //
          // `md:contents` in dense for the same reason the supporting grid uses it — dense
          // lays the whole card out as one baseline-aligned row, and a nested grid would
          // hold the heroes out of it.
          <div
            className={cn(
              heroes.length > 1 && 'grid gap-4 sm:grid-cols-2',
              heroes.length > 1 && isDense && 'md:contents',
            )}
          >
            {heroes.map((figure) => (
              <KpiFigureBlock
                key={figure.id}
                kpi={figure}
                figureToken={heroToken}
                hideSubLineAtMd={isDense}
              />
            ))}
          </div>
        ) : null}
        {showHeroDivider ? (
          // `md:hidden` in dense: from md up the CardContent IS the figure row, and a
          // horizontal rule dropped into it would slice that row in two. Below md the
          // dense card renders its comfortable form, so the rule belongs there.
          <Separator className={cn(isDense && 'md:hidden')} />
        ) : null}
        {rest.length > 0 ? (
          // `md:contents` dissolves the grid at md+ so the figures join the dense row;
          // below md it stays the comfortable supporting grid.
          <div className={cn('grid gap-4', supportingGridCols(rest.length), isDense && 'md:contents')}>
            {rest.map((figure) => (
              <KpiFigureBlock
                key={figure.id}
                kpi={figure}
                figureToken={restToken}
                hideSubLineAtMd={isDense}
              />
            ))}
          </div>
        ) : null}
        {/* In dense the CardContent IS the figure row (flex-row at md+), so anything below
            the figures would otherwise pack into that row as one more item — a Progress bar
            rendered inline beside a number. `basis-full` forces these blocks onto their own
            line, which is where they read. */}
        {footer ? <div className={cn('w-full', isDense && 'md:basis-full')}>{footer}</div> : null}
        {actions ? (
          <>
            <Separator className={cn(isDense && 'md:basis-full')} />
            <div className={cn('flex flex-wrap gap-2', isDense && 'md:basis-full')}>{actions}</div>
          </>
        ) : null}
      </CardContent>
    </Card>
  )
}

/**
 * Loading placeholder for a KpiSummaryCard. It mirrors the real card's structure so the
 * figures resolve in place instead of popping the layout: the hero block over a
 * supporting grid of `supportingCount` blocks. The bars are sized in `h-*` steps that
 * track the responsive figure ramp, so the skeleton holds at every viewport.
 *
 * It resolves density from the SAME source the card does (`useKpiDensity`), so pass the
 * card's `dense` / `storageKey`. Without them a reader who collapsed the card would get a
 * tall comfortable skeleton that snaps into a short dense card on the next load — the very
 * layout shift this component exists to prevent.
 */
export function KpiSummaryCardSkeleton({
  supportingCount = 3,
  heroCount = 1,
  footer = false,
  dense = false,
  storageKey,
}: {
  supportingCount?: number
  /** Draw a footer line, when the card it stands in for has one. A caption row plus the
   *  CardContent gap is enough to jump everything below the card when the data lands —
   *  the same class of shift `heroCount` exists for, one slot further down. */
  footer?: boolean
  /** How many hero bars to draw — match the card's `heroId` (1, or 2 for a lane pair).
   *  A skeleton with one bar in front of a two-hero card shifts the whole grid down by a
   *  52px row the moment the data lands, which is the shift this component exists to
   *  prevent. */
  heroCount?: 1 | 2
  dense?: boolean
  storageKey?: string
}) {
  const { isDense } = useKpiDensity({ dense, storageKey })

  return (
    <Card>
      <CardContent
        className={cn(
          // The card aligns its dense row on the figures' shared baseline. A skeleton bar
          // carries no text and so has no baseline — `items-end` reproduces the same
          // geometry (the bars' bottom edges line up where the figures' baselines will be),
          // which is what keeps the swap from shifting.
          isDense && 'flex flex-col gap-2 md:flex-row md:flex-wrap md:items-end md:gap-x-8 md:gap-y-3',
          // Mirror the card's reservation for the floating toggle, so the row wraps at the
          // same widths here and in the loaded card. A card can only mount dense after the
          // reader collapsed it, which requires the toggle — so reserving whenever dense is
          // always right, and it is invisible anyway (the bars pack left).
          isDense && 'md:pr-10',
        )}
      >
        <div
          className={cn(
            heroCount > 1 && 'grid gap-4 sm:grid-cols-2',
            heroCount > 1 && isDense && 'md:contents',
          )}
        >
          {Array.from({ length: heroCount }, (_, index) => (
            <div key={index} className="flex flex-col gap-1">
              <Skeleton className="h-4 w-28" />
              <Skeleton
                className={cn('w-48', isDense ? 'h-9 md:h-7 md:w-32 desktop:h-8' : 'h-9 md:h-11 desktop:h-15')}
              />
            </div>
          ))}
        </div>
        {supportingCount > 0 ? (
          <div
            className={cn('grid gap-4', supportingGridCols(supportingCount), isDense && 'md:contents')}
          >
            {Array.from({ length: supportingCount }, (_, index) => (
              <div key={index} className="flex flex-col gap-1">
                <Skeleton className="h-4 w-20" />
                <Skeleton className={cn('h-6 w-24', !isDense && 'md:h-7 desktop:h-10')} />
              </div>
            ))}
          </div>
        ) : null}
        {footer ? (
          <div className={cn('w-full', isDense && 'md:basis-full')}>
            <Skeleton className="h-4 w-64" />
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

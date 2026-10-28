import {
  Children,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react'
import { cn } from '@/app/lib/utils'
import { Sheet, SheetContent, SheetTitle } from '@/app/components/components'
import {
  PanelPositionContext,
  PanelInlineBreakpointContext,
  PANEL_MIN_FIT,
  type PanelPosition,
  type PanelProps,
  type PanelInlineBreakpoint,
} from './panel'

export type PanelGroupLayout = 'stacked' | 'inline'

export type PanelGroupProps = {
  children: ReactNode
  layout?: PanelGroupLayout
  /**
   * The viewport breakpoint at which an `inline` group becomes a side-by-side row;
   * below it the panels stack in a single column. `lg` (1024, default) suits most
   * splits; `xl` (1280) keeps a `fill` + `aside` split stacked on laptops where two
   * columns are too cramped. No effect on a `stacked` group. The `fill` height-bound
   * modifier, the overflow measurement, and each Panel's `min-h-0` all switch on this
   * same breakpoint, so nothing height-bounds before the row exists.
   */
  inlineAt?: PanelInlineBreakpoint
  /**
   * Fill the available height of the parent (`min-h-0 flex-1`) so the enclosed
   * Panels become height-bounded and can scroll their content independently.
   * Off by default — page-scrolling groups (e.g. a full-width table) stay
   * content-sized. Also the switch that enables responsive overflow: an
   * `inline` + `fill` group measures its own width and moves the trailing
   * panel(s) that do not fit into a Sheet (see § overflow below).
   */
  fill?: boolean
  /**
   * Called when the overflow Sheet is dismissed (its close button, backdrop, or
   * `Esc`). Mirrors how MasterDetailLayout's detail close is consumer-owned: the
   * consumer decides whether the overflow panel exists, so dismissing means the
   * consumer removes it (e.g. clears its selection). Required to make the Sheet
   * closable when 3+ panels are passed — without it the Sheet stays open while
   * the panel overflows. Has no effect unless `inline` + `fill` and a panel is
   * currently overflowing.
   */
  onOverflowDismiss?: () => void
  /**
   * Accessible name for the overflow Sheet (rendered `sr-only`, satisfies the
   * dialog title requirement). Pass something meaningful for the promoted panel;
   * defaults to a neutral `'Panel'`.
   */
  overflowTitle?: string
}

// Stacked, the gap IS the vertical card rhythm, so it steps down on a phone (16px) and
// only opens to 24px from `md`. Same ramp as the page columns that host these panels.
const STACKED = 'flex flex-col gap-4 md:gap-6'

// Below the inline breakpoint the panels stack into a single column (flex-col +
// gap) so an inline split never overlaps on a narrow viewport: a `fill` panel's
// min-w-0 lets it collapse to a sliver rather than wrap, so flex-wrap alone does
// not stack a fill + aside split — its content then overflows the crushed column
// (UX-03). The split waits for `lg` (≥1024) by default so tablet (768–1023) stays
// single-column too — a fill + aside is too cramped side by side there (UX-13/14) —
// which also aligns the inline breakpoint with MasterDetailLayout's sub-1024
// collapse; `xl` (≥1280) pushes the split later still, keeping a cramped split
// stacked on a laptop. At the breakpoint the panels sit flush in a row (gap-0) per
// the DEX-DS reference, with separation from each panel's content padding and
// section-header inset. Static per-breakpoint strings — Tailwind can't interpolate
// the responsive prefix.
// While stacked, the gap is the vertical card rhythm and steps down on a phone
// (`gap-4 md:gap-6`); at the inline breakpoint the panels go flush and it drops to 0.
const INLINE_AT: Record<PanelInlineBreakpoint, string> = {
  lg: 'flex flex-col gap-4 md:gap-6 lg:flex-row lg:flex-wrap lg:gap-0',
  xl: 'flex flex-col gap-4 md:gap-6 xl:flex-row xl:flex-wrap xl:gap-0',
}

// The `fill` split is height-bounded and nowrap (each panel scrolls independently)
// only at/above the inline breakpoint; below it the group stays content-sized and
// wrapped (stacked), so the page scrolls. Responsive overflow (the measurement
// query) is gated to the same breakpoint — it replaces the would-be horizontal
// squish of the nowrap row.
const FILL_AT: Record<PanelInlineBreakpoint, string> = {
  lg: 'lg:min-h-0 lg:flex-1 lg:flex-nowrap',
  xl: 'xl:min-h-0 xl:flex-1 xl:flex-nowrap',
}

const OVERFLOW_QUERY: Record<PanelInlineBreakpoint, string> = {
  lg: '(min-width: 1024px)',
  xl: '(min-width: 1280px)',
}

/** Position of a panel among `count` inline siblings (drives the gutter shading). */
function positionAt(index: number, count: number): PanelPosition {
  if (count <= 1) return 'only'
  if (index === 0) return 'first'
  if (index === count - 1) return 'last'
  return 'middle'
}

/** Stable key for a panel child, falling back to its index. */
function panelKey(panel: ReactNode, index: number): string | number {
  return isValidElement(panel) ? panel.key ?? index : index
}

/**
 * Measures the group's own width and reports how many leading panels fit side by
 * side at their minimum-fit widths (`PANEL_MIN_FIT`). Container-aware by design:
 * it reads the rendered width (not the viewport), so a collapsed nav rail grants
 * room for more panels. Disabled groups (or before the first measurement / below
 * lg) report every panel as visible, so nothing is ever moved into the Sheet
 * until we know it genuinely does not fit — no first-paint Sheet flash.
 */
function useFittingCount(
  enabled: boolean,
  minFits: number[],
  query: string,
): { ref: RefObject<HTMLDivElement>; fittingCount: number } {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState<number | null>(null)
  const [atBreakpoint, setAtBreakpoint] = useState(false)

  useEffect(() => {
    if (!enabled) return
    const mq = window.matchMedia(query)
    const sync = () => setAtBreakpoint(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [enabled, query])

  useEffect(() => {
    if (!enabled) return
    const node = ref.current
    if (!node) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width)
    })
    observer.observe(node)
    return () => observer.disconnect()
  }, [enabled])

  let fittingCount = minFits.length
  if (enabled && atBreakpoint && width !== null) {
    let sum = 0
    fittingCount = 0
    for (let i = 0; i < minFits.length; i++) {
      const next = sum + minFits[i]
      // Always keep the first panel (the master/navigation column); add each
      // following panel only while the running total still fits the measured
      // width.
      if (i === 0 || next <= width) {
        sum = next
        fittingCount = i + 1
      } else {
        break
      }
    }
    // Never move a panel out of a two-panel group: keep at least two side by
    // side (when the group has two). This protects the 2-panel master-detail
    // contract — the detail is always a real panel, never an overlay/Sheet
    // — so only a 3rd+ panel is ever promoted.
    fittingCount = Math.max(fittingCount, Math.min(minFits.length, 2))
  }
  return { ref, fittingCount }
}

/**
 * Arranges sibling Panels relative to each other. Controls panel arrangement
 * only - never the width of a Panel (that is the Panel `type`) nor the layout
 * of content inside a Panel (that is PanelContent `layout`).
 *
 * For an `inline` group it publishes each child's position (first / middle /
 * last / only) via PanelPositionContext so PanelContent shades the shared
 * inter-panel gutter: outer faces (group edges) keep the 40px page gutter, inner
 * faces (between adjacent panels) drop to 20px, so a gap between two panels sums
 * to 40px. A `stacked` group is vertical - every panel is full width and stays
 * `only` (40px on both faces).
 *
 * Responsive overflow (inline + fill, lg+): the group measures its own width and
 * keeps the leading panels that fit side by side; the trailing panel(s) that do
 * not fit are moved into a right-anchored Sheet (a 3rd panel opens as a drawer
 * over the 1st + 2nd, with the standard full-screen backdrop). Below lg the
 * group stays wrapped/stacked and nothing is promoted. The group always keeps at
 * least two panels in flow, so a 2-panel split is never promoted — the
 * master-detail "detail is a real panel, never a Sheet" contract holds, and only
 * a 3rd panel triggers the Sheet. Whether the overflow panel exists is the
 * consumer's choice (it passes 2 or 3 children); wire `onOverflowDismiss` so the
 * Sheet's close/backdrop can remove it.
 */
export function PanelGroup({
  children,
  layout = 'stacked',
  inlineAt = 'lg',
  fill = false,
  onOverflowDismiss,
  overflowTitle = 'Panel',
}: PanelGroupProps) {
  const panels = Children.toArray(children)
  const minFits = panels.map((panel) =>
    PANEL_MIN_FIT[(isValidElement<PanelProps>(panel) && panel.props.type) || 'fill'],
  )
  // Overflow only applies to side-by-side splits that fill height (the nowrap
  // regime where panels would otherwise squish). Stacked and non-fill inline
  // groups wrap safely and never promote.
  const overflowEnabled = layout === 'inline' && fill
  const { ref, fittingCount } = useFittingCount(overflowEnabled, minFits, OVERFLOW_QUERY[inlineAt])

  const className = cn(layout === 'inline' ? INLINE_AT[inlineAt] : STACKED, fill && FILL_AT[inlineAt])

  // Stacked groups are vertical: every panel is full width, so the gutter stays
  // 40px on both faces (the PanelPositionContext default `only`).
  if (layout !== 'inline') {
    return <div className={className}>{children}</div>
  }

  const inFlow = panels.slice(0, fittingCount)
  const overflow = panels.slice(fittingCount)
  const hasOverflow = overflow.length > 0

  // Panels that fit render side by side as before. Any trailing panel that does
  // not fit opens in a right-anchored Sheet over them (its backdrop, close
  // button, and Esc are owned by Sheet). When nothing overflows the Sheet stays
  // closed and the render is identical to a plain inline row.
  return (
    <PanelInlineBreakpointContext.Provider value={inlineAt}>
      <div ref={ref} className={className}>
        {inFlow.map((panel, index) => (
          <PanelPositionContext.Provider key={panelKey(panel, index)} value={positionAt(index, inFlow.length)}>
            {panel}
          </PanelPositionContext.Provider>
        ))}
        <Sheet open={hasOverflow} onOpenChange={(open) => (open ? undefined : onOverflowDismiss?.())}>
          <SheetContent side="bottom" aria-describedby={undefined}>
            <SheetTitle className="sr-only">{overflowTitle}</SheetTitle>
            {overflow.map((panel, index) => (
              <PanelPositionContext.Provider key={panelKey(panel, index)} value="only">
                {panel}
              </PanelPositionContext.Provider>
            ))}
          </SheetContent>
        </Sheet>
      </div>
    </PanelInlineBreakpointContext.Provider>
  )
}

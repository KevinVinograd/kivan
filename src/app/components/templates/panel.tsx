import { createContext, useContext, type ReactNode } from 'react'
import { cn } from '@/app/lib/utils'

export type PanelType = 'fill' | 'medium' | 'compact' | 'aside'

export type PanelPosition = 'only' | 'first' | 'middle' | 'last'

/**
 * A Panel's position within its enclosing PanelGroup, published by PanelGroup so
 * PanelContent can shade the shared inter-panel gutter: outer faces (the group's
 * edges) take the full 40px page gutter, inner faces (between adjacent panels)
 * take 20px each, so the gap between two panels sums to 40px. Defaults to `only`
 * (a lone panel, or one rendered outside a PanelGroup) — full 40px on both faces.
 */
export const PanelPositionContext = createContext<PanelPosition>('only')

/**
 * The breakpoint at which the enclosing `inline` PanelGroup becomes a side-by-side
 * row (`lg`=1024 default, `xl`=1280 when a split is too cramped on a laptop).
 * Published by PanelGroup so a Panel gates its height-bound `min-h-0` floor to the
 * SAME breakpoint as the row: applying `min-h-0` while the group is still stacked
 * would let a `flex-basis:0%` panel (e.g. `aside`) collapse below its content. A
 * lone Panel (or a stacked group) defaults to `lg`, matching the historical
 * `lg:min-h-0`.
 */
export type PanelInlineBreakpoint = 'lg' | 'xl'
export const PanelInlineBreakpointContext = createContext<PanelInlineBreakpoint>('lg')

export type PanelProps = {
  type?: PanelType
  children: ReactNode
}

const TYPE: Record<PanelType, string> = {
  // flex: 1 1 auto - grows to fill the available track.
  fill: 'flex-1 min-w-0',
  // Fill wrapper; the 600px cap lives on the inner content column, not here.
  medium: 'flex-1 min-w-0',
  // flex: 0 1 360px - fixed rail for lists, side summaries, status panels.
  compact: 'grow-0 shrink basis-[360px] min-w-[320px] max-w-[360px]',
  // flex: 0.5 1 0% - fluid secondary rail that grows at half the weight of a
  // `fill` sibling, so a fill + aside split lands ~2:1; the 320px floor wraps it
  // to its own row below the split. Unlike `compact` it has no max width.
  aside: 'flex-[0.5_1_0%] min-w-[320px]',
}

/**
 * Minimum comfortable width (px) per panel type - the floor below which a panel
 * is no longer usable side by side. PanelGroup reads this (by each child's
 * `type`) to decide, against its own measured CONTAINER width, how many inline
 * panels fit before the trailing one is moved into a responsive overflow Sheet.
 * These are fit thresholds for the arrangement decision, NOT CSS widths: the
 * actual flex sizing still lives in `TYPE` above (Panel owns width).
 * `compact` matches its hard 320px floor; `medium`/`fill` use a comfortable
 * working floor below their fluid track. They tune WHEN a 3rd+ panel overflows;
 * the 2-panel split is never promoted regardless (PanelGroup keeps two panels in
 * flow), so the master-detail "detail is a real panel, never a Sheet" contract
 * holds.
 */
export const PANEL_MIN_FIT: Record<PanelType, number> = {
  fill: 360,
  medium: 400,
  compact: 320,
  aside: 320,
}

/**
 * Page-colored structural content container. Panels sit on the page background
 * (no card surface) per the DEX-DS reference - inner surfaces belong to content
 * blocks, never the panel wrapper. `type` controls width behavior only:
 *   fill    - grows to fill the available track.
 *   compact - fixed 320-360px rail (lists, summaries).
 *   aside   - fluid secondary rail: grows at half the weight of a `fill` sibling
 *             (flex 0.5), so a fill + aside split lands ~2:1; 320px floor wraps
 *             it below the split. No max width (unlike `compact`).
 *   medium  - fills the track but caps its CONTENT at 600px, centered (entity
 *             detail, forms). The 600px lives on the content column below, so
 *             the wrapper stays fill.
 * Horizontal content padding is position-driven: PanelContent reads
 * PanelPositionContext (published by the enclosing PanelGroup), not the type.
 */
export function Panel({ type = 'fill', children }: PanelProps) {
  // Gate the height-bound `min-h-0` floor to the SAME breakpoint at which the
  // enclosing inline group becomes a side-by-side row (published by PanelGroup).
  const inlineBreakpoint = useContext(PanelInlineBreakpointContext)

  const content =
    type === 'medium' ? (
      <div className="mx-auto flex min-h-0 w-full max-w-[600px] flex-1 flex-col">{children}</div>
    ) : (
      children
    )

  return (
    // `min-h-0` (the height-bound floor that lets a panel scroll its content
    // internally) is gated to the group's inline breakpoint (`lg` default, `xl`
    // when the split waits for a wider viewport), where panels sit side by side in
    // a height-bounded `fill` row. Below that breakpoint panels stack in a column
    // and must stay content-sized: with an unconditional `min-h-0` a stacked panel
    // can be sized below its content by the column's flex distribution and overflow
    // onto the next panel (e.g. actividad reciente over alertas críticas).
    <section
      data-type={type}
      className={cn('flex flex-col', inlineBreakpoint === 'xl' ? 'xl:min-h-0' : 'lg:min-h-0', TYPE[type])}
    >
      {content}
    </section>
  )
}

import { forwardRef, useContext, type ReactNode } from 'react'
import { cn } from '@/app/lib/utils'
import { motionClass, type MotionPreset } from '@/app/lib/motion'
import {
  PanelInlineBreakpointContext,
  PanelPositionContext,
  type PanelInlineBreakpoint,
  type PanelPosition,
} from './panel'

export type PanelContentLayout = 'stacked' | 'inline' | 'grid'

/**
 * Density of the inter-block gap for the `stacked` / `grid` layouts. Undefined =
 * the responsive ramp (the default): 16px on tablet/laptop, stepping up to 24px
 * at the `desktop` breakpoint (1440px). The prop pins a FLAT tier at every
 * viewport: `comfortable` = 24px everywhere, `dense` = 16px everywhere. The
 * `inline` layout keeps its 12px micro-row gap regardless (out of the ramp).
 */
export type PanelContentDensity = 'comfortable' | 'dense'

export type PanelContentProps = {
  layout?: PanelContentLayout
  density?: PanelContentDensity
  children: ReactNode
  columns?: 1 | 2 | 3 | 4
  /** Drop the top padding (e.g. a panel whose first child should sit flush to the top). */
  flushTop?: boolean
  /**
   * Mount-enter motion for the panel BODY (opacity + short translateX). Defaults
   * to `panel-enter` so a detail/master-detail panel slides in softly when it
   * mounts. Applied to the content region only — never the structural width
   * wrapper — so the layout never janks. Pass `none` to opt out. See
   * `lib/motion.ts`.
   */
  motion?: MotionPreset
}

const LAYOUT: Record<PanelContentLayout, string> = {
  // The inter-block gap for `stacked`/`grid` is density-driven (see STACK_GAP);
  // `inline` keeps its own 12px (gap-3) micro-row gap, out of the density ramp.
  // `*:shrink-0`: this column scrolls, and a child with a fixed height (an `h-10` Input)
  // or its own `overflow` may otherwise be shrunk below its content before the column
  // scrolls. In a height-bound split the Equipo and Clientes search fields rendered 27px
  // tall; children keep their own height and the panel scrolls instead.
  stacked: 'flex flex-col *:shrink-0',
  inline: 'flex flex-wrap items-center gap-3',
  grid: 'grid',
}

// Inter-block gap for the `stacked` / `grid` layouts, per density. The responsive
// default ramps 16px (gap-4) → 24px (gap-6) at the `desktop` breakpoint (1440px);
// the `density` prop pins a flat tier. `inline` is excluded (keeps its gap-3).
const STACK_GAP: Record<PanelContentDensity | 'responsive', string> = {
  responsive: 'gap-4 desktop:gap-6',
  dense: 'gap-4',
  comfortable: 'gap-6',
}

// Grid collapses to a single column on mobile and steps up at sm/lg.
const GRID_COLUMNS: Record<1 | 2 | 3 | 4, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
}

// Horizontal padding shades the shared inter-panel gutter by the panel's position in
// its PanelGroup (PanelPositionContext) AND by the breakpoint at which that group
// actually becomes a side-by-side row (PanelInlineBreakpointContext). The outer page
// gutter is responsive: 16px (px-4) below md, 24px (px-6) at md (tablet), 32px (px-8)
// at lg (laptop), and 40px (px-10) at the desktop breakpoint (>=1440). While the group
// is still stacked, every position takes the full page gutter on both faces (a stacked
// panel is never asymmetrically inset); once the row exists, outer faces (group edges)
// ramp 32px->40px while inner faces (toward an adjacent panel) hold 20px (px-5). The
// shading must therefore start at the group's OWN breakpoint: an `xl` group stays
// stacked through the whole lg band, so shading it at lg would inset a full-width panel
// against nothing (the aside would sit 12px left of the column above it). A lone panel /
// outside a group (`only`) takes the full ramp on both faces. Vertical padding is 16px
// top (pt-4, or pt-0 when flushTop) and 16px bottom (pb-4); the viewport-floor clearance
// lives on MainContent.
const HORIZONTAL: Record<PanelInlineBreakpoint, Record<PanelPosition, string>> = {
  lg: {
    only: 'px-4 md:px-6 lg:px-8 desktop:px-10',
    first: 'px-4 md:px-6 lg:pl-8 lg:pr-5 desktop:pl-10',
    middle: 'px-4 md:px-6 lg:px-5',
    last: 'px-4 md:px-6 lg:pl-5 lg:pr-8 desktop:pr-10',
  },
  xl: {
    only: 'px-4 md:px-6 lg:px-8 desktop:px-10',
    first: 'px-4 md:px-6 lg:px-8 xl:pr-5 desktop:pl-10',
    middle: 'px-4 md:px-6 lg:px-8 xl:px-5',
    last: 'px-4 md:px-6 lg:px-8 xl:pl-5 desktop:pr-10',
  },
}

/**
 * Controls the internal layout of content inside a Panel. Owns the panel body
 * padding and child arrangement only - never the panel width (that is the Panel
 * `type`). The horizontal padding follows the panel's position in its PanelGroup
 * (read from PanelPositionContext); `columns` applies to the grid layout exclusively.
 *
 * It is the panel's scroll region (`flex-1 min-h-0 overflow-y-auto`): when the
 * enclosing Panel is height-bounded (a master-detail split), the body scrolls
 * here while sibling chrome such as a SectionHeader stays pinned; when the Panel
 * is content-sized, it simply fits and never scrolls.
 *
 * Forwards a `ref` to its scroll `div` so a consumer can observe the scroll
 * region (e.g. a scroll-reveal header watching when a hero scrolls out of view).
 */
export const PanelContent = forwardRef<HTMLDivElement, PanelContentProps>(function PanelContent(
  { layout = 'stacked', density, columns = 3, flushTop = false, motion = 'panel-enter', children },
  ref,
) {
  const position = useContext(PanelPositionContext)
  const inlineBreakpoint = useContext(PanelInlineBreakpointContext)
  return (
    <div
      ref={ref}
      className={cn(
        'min-h-0 flex-1 overflow-y-auto pb-4',
        flushTop ? 'pt-0' : 'pt-4',
        HORIZONTAL[inlineBreakpoint][position],
        LAYOUT[layout],
        layout !== 'inline' && STACK_GAP[density ?? 'responsive'],
        layout === 'grid' && GRID_COLUMNS[columns],
        motionClass(motion),
      )}
    >
      {children}
    </div>
  )
})

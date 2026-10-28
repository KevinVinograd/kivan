import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/app/lib/utils'
import { motionClass } from '@/app/lib/motion'
import { useIsMobile, useIsBelowDesktop } from '@/app/lib/use-is-mobile'
import { Sheet, SheetContent, SheetTitle } from '@/app/components/components'
import { PanelGroup } from './panel-group'
import { Panel } from './panel'

export type MasterDetailLayoutProps = {
  /**
   * Currently selected record id. `null` renders the full-width table panel;
   * any value renders the compact list + detail split.
   */
  selectedId: string | null
  /** Full-width content shown when nothing is selected (typically a DataTable). */
  table: ReactNode
  /** Compact list shown in the left panel when a record is selected. */
  list: ReactNode
  /** Detail content shown in the right panel when a record is selected. */
  detail: ReactNode
  /**
   * Width behavior of the detail panel. `medium` (default) caps the detail
   * content at 600px for an entity/form column; `fill` lets it span the track
   * for a wider, multi-column detail (e.g. a modular dashboard overview).
   */
  detailType?: 'medium' | 'fill'
  /**
   * Mobile (below `md`) detail presentation. `sheet` (default, the record-detail
   * case) shows the `list` full-width and opens the `detail` in a right Sheet
   * over it, so the detail is never squished into a sliver. `inline` keeps the
   * desktop split arrangement on mobile too — for the persistent-nav case
   * (a settings-style rail whose detail is always present and has no close), where
   * an always-open Sheet would trap the user. `step` is the two-step drilldown:
   * below desktop it shows ONLY the `list` (step 1) until the consumer flags
   * `mobileEntered`, then swaps to ONLY the `detail` (step 2) with a back trail
   * (`mobileStepHeader`, typically a Breadcrumb) above it — a real page drill, not
   * an overlay. Desktop is the unchanged split for every mode.
   */
  mobileDetail?: 'sheet' | 'inline' | 'step'
  /**
   * `step` mode only — below desktop, whether the user has drilled into the
   * record. `false` renders the `list` (step 1); `true` renders `mobileStepHeader`
   * + `detail` full-width (step 2). Ignored on desktop and in `sheet`/`inline`.
   */
  mobileEntered?: boolean
  /**
   * `step` mode only — a back trail (typically a `Breadcrumb`) rendered above the
   * `detail` in step 2 below desktop, so the user can step back to the list. The
   * consumer owns its copy and its back target. Ignored on desktop and in
   * `sheet`/`inline`.
   */
  mobileStepHeader?: ReactNode
  /**
   * Called when the mobile detail Sheet is dismissed (backdrop / `Esc`). The
   * consumer clears its selection in response — the same handler it wires to the
   * detail's own close. Without it the Sheet's backdrop/`Esc` cannot close (the
   * detail's own close control still works). Desktop is unaffected.
   */
  onCloseDetail?: () => void
  /** Accessible name for the mobile detail Sheet (`sr-only`). Defaults to `"Detalle"`. */
  detailTitle?: string
  /**
   * Notifies the consumer when the EFFECTIVE rendered mode changes between the
   * full-width `table` and the `list` + `detail` split. Unlike `selectedId`, this
   * tracks the actual rendered layout: on close it stays `'split'` through the
   * exit window and flips to `'table'` only once the panels finish transitioning
   * back, so a consumer can dissolve/re-show a page-level header (e.g. show/hide a
   * PageHeader) in lockstep with the transition instead of with the raw selection
   * flip — removing the frame where both the page header and the closing split are
   * on screen.
   */
  onModeChange?: (mode: 'table' | 'split') => void
}

/** Phase of the desktop table <-> split view transition. */
type TransitionPhase = 'table' | 'opening' | 'split' | 'closing'

/** How long a transient phase may wait for the `animationend` that advances it before the
 *  layout settles it on its own. Deliberately far past the longest real chain so it never
 *  races a healthy transition, and short enough that a dropped event is not a dead screen. */
const PHASE_SETTLE_FALLBACK_MS = 1000

/**
 * Tracks `prefers-reduced-motion` so the desktop transition can collapse to an
 * instant table <-> split swap (no dissolve, no slide) — mirrors the global
 * reduced-motion strip in `semantics-motion.css`.
 */
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduced(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])
  return reduced
}

/**
 * Selection-driven master-detail scaffold. On desktop it switches between a
 * single full-width panel (no selection) and a two-panel compact list + detail
 * split (a record is selected) inside the MainContent, with a staged view
 * transition: the content (table) dissolves in place — blur + fade + a subtle
 * scale-recede, no translate — then the list slides in from the left and the
 * detail from the right (staggered); closing reverses it exactly. Below `md` (the
 * record-detail default, `mobileDetail="sheet"`) it instead shows the `list`
 * full-width and opens the `detail` in a right Sheet, so the detail is never
 * squished into a sliver on a narrow viewport; `mobileDetail="inline"` keeps the
 * split on mobile for the persistent-nav case; `mobileDetail="step"` is the
 * two-step drilldown (list → detail page with a back trail). Pure layout: it owns
 * no selection state. The consumer owns `selectedId`, wires the close affordance
 * inside the `detail` slot, and passes `onCloseDetail` so the mobile Sheet's
 * backdrop/`Esc` can clear the selection too.
 */
export function MasterDetailLayout({
  selectedId,
  table,
  list,
  detail,
  detailType = 'medium',
  mobileDetail = 'sheet',
  mobileEntered = false,
  mobileStepHeader,
  onCloseDetail,
  detailTitle = 'Detalle',
  onModeChange,
}: MasterDetailLayoutProps) {
  const present = selectedId !== null
  // Collapse the two-pane split below the desktop breakpoint (mobile + tablet):
  // the detail is too narrow beside the list across the whole sub-1024 range.
  const isBelowDesktop = useIsBelowDesktop()
  // Mobile (≤767) shows the compact list as the base — a wide table does not fit.
  // Tablet (768–1023) keeps the richer table base (it fits with horizontal
  // scroll) and only moves the detail into the Sheet, so a consumer whose compact
  // list is not its primary surface still renders its full table at tablet.
  const isMobile = useIsMobile()
  const prefersReducedMotion = usePrefersReducedMotion()

  // Freeze the last selected list + detail: the consumer nulls the detail's
  // data on the same tick selectedId clears, so during the exit window we render
  // these captured nodes instead of empty content. Updated only while selected.
  const held = useRef<{ list: ReactNode; detail: ReactNode }>({ list, detail })
  if (present) held.current = { list, detail }

  // Desktop table <-> split phase machine. The SPLIT is the base layer for its
  // whole life (opening → split → closing) so its list/detail never remount (no
  // replayed enter, no lost state); the TABLE is the absolute overlay while a
  // transition runs and the base only at rest. Phase advances on `animationend`
  // (the last-finishing half) — see the render below. Below desktop or under
  // reduced motion there is no staged transition: the phase settles instantly, so
  // the Sheet/inline/step branches and reduced-motion users get an immediate swap.
  const [phase, setPhase] = useState<TransitionPhase>(present ? 'split' : 'table')
  useEffect(() => {
    if (isBelowDesktop || prefersReducedMotion) {
      setPhase(present ? 'split' : 'table')
      return
    }
    if (present && (phase === 'table' || phase === 'closing')) {
      setPhase('opening')
    } else if (!present && (phase === 'split' || phase === 'opening')) {
      setPhase('closing')
    }
  }, [present, phase, isBelowDesktop, prefersReducedMotion])

  // A transient phase advances ONLY on `animationend`, and an animation that never runs
  // never sends one: a transition interrupted mid-flight, a tab backgrounded before the
  // frame lands, or a node remounted while it plays all drop the event. The phase then
  // stays `opening`/`closing` for good, and since consumers read `mode` to decide whether
  // to dissolve the page header, the screen stays rendered but inert with nothing on it
  // saying why. Settle it anyway, well past the longest real chain (~450ms: a 120ms
  // content-in behind a 330ms delay).
  useEffect(() => {
    if (phase !== 'opening' && phase !== 'closing') return
    const timer = window.setTimeout(() => {
      setPhase(phase === 'opening' ? 'split' : 'table')
    }, PHASE_SETTLE_FALLBACK_MS)
    return () => window.clearTimeout(timer)
  }, [phase])

  // Effective rendered mode: `'split'` while a record is selected OR still
  // transitioning back (any phase other than the settled `'table'`), `'table'`
  // only once the exit transition has finished. Reporting this (not the raw
  // `present`) lets a consumer dissolve/re-show a page-level header on the SAME
  // frame the split settles, so closing reads as one step instead of the header
  // popping back in mid-exit. The callback is held in a ref so an inline arrow
  // does not refire the effect.
  const mode: 'table' | 'split' = phase === 'table' ? 'table' : 'split'
  const onModeChangeRef = useRef(onModeChange)
  useEffect(() => {
    onModeChangeRef.current = onModeChange
  })
  useEffect(() => {
    onModeChangeRef.current?.(mode)
  }, [mode])

  // Below desktop (mobile + tablet) record-detail: render a single full-width
  // base panel and open the detail in a bottom Sheet over it (backdrop/Esc/exit
  // owned by Sheet), so the detail is never squished into a sliver beside the
  // list. Mobile uses the compact list as the base (a wide table does not fit);
  // tablet keeps the table base (it fits with horizontal scroll), falling back to
  // the list only when a consumer has no table slot.
  if (isBelowDesktop && mobileDetail === 'sheet') {
    const base = isMobile ? list : (table ?? list)
    return (
      <>
        <PanelGroup layout="inline">
          <Panel type="fill">{base}</Panel>
        </PanelGroup>
        <Sheet open={present} onOpenChange={(open) => (open ? undefined : onCloseDetail?.())}>
          <SheetContent side="bottom" aria-describedby={undefined} showCloseButton={false}>
            <SheetTitle className="sr-only">{detailTitle}</SheetTitle>
            <div className="flex min-h-0 flex-1 flex-col">{present ? detail : held.current.detail}</div>
          </SheetContent>
        </Sheet>
      </>
    )
  }

  // Below desktop, persistent-nav (inline) mode: the two-pane split is too narrow
  // for the detail at tablet/phone widths, so stack the list (rail) and detail
  // full-width in a single column instead of squishing them side by side. No
  // Sheet here: the inline detail is always present and has no close, so an
  // always-open Sheet would trap the user.
  if (isBelowDesktop && mobileDetail === 'inline') {
    return (
      <PanelGroup layout="stacked">
        <Panel type="fill">{list}</Panel>
        <Panel type="fill">{detail}</Panel>
      </PanelGroup>
    )
  }

  // Below desktop, two-step drilldown (step) mode: show ONE pane at a time. Step 1
  // (`!mobileEntered`) is the `list` (rail) full-width; entering a record swaps to
  // step 2 — a single full-width `detail` page with the consumer's back trail
  // (`mobileStepHeader`, a Breadcrumb) above it. Unlike `inline` (which stacks
  // rail + detail together), `step` gives the detail the whole viewport and uses
  // the trail as the back affordance — the persistent-nav drilldown. No Sheet:
  // the detail is a real page, not an overlay.
  if (isBelowDesktop && mobileDetail === 'step') {
    if (!mobileEntered) {
      return (
        <PanelGroup layout="stacked">
          <Panel type="fill">{list}</Panel>
        </PanelGroup>
      )
    }
    return (
      <PanelGroup layout="stacked">
        <Panel type="fill">
          {mobileStepHeader}
          {detail}
        </Panel>
      </PanelGroup>
    )
  }

  // Desktop (≥1024): staged table <-> split transition.
  // - `table` phase: the full-width table panel, content-sized (page scroll).
  // - `opening`/`split`/`closing`: the split is the base (fills the viewport
  //   height, each panel scrolls independently); the table rides on top as an
  //   inert absolute overlay while it dissolves out (open) or in (close).
  // During `closing` the split renders the frozen nodes and slides them out; the
  // content dissolves back in on the overlay, and the phase settles to `table`
  // when that dissolve-in ends.
  const splitShown = phase === 'opening' || phase === 'split' || phase === 'closing'
  const tableOverlay = phase === 'opening' || phase === 'closing'
  const splitNodes = phase === 'closing' ? held.current : { list, detail }

  return (
    <div className={cn('relative', phase !== 'table' && 'flex min-h-0 flex-1')}>
      {splitShown ? (
        <PanelGroup layout="inline" fill>
          <Panel type="compact">
            {/* List slide: in from the left (open), out to the left after the
                detail (close). A stable wrapper so the list content never
                remounts across the transition. */}
            <div
              className={cn(
                'flex min-h-0 flex-1 flex-col',
                phase === 'opening' && motionClass('md-list-in'),
                phase === 'closing' && motionClass('md-list-out'),
              )}
            >
              {splitNodes.list}
            </div>
          </Panel>
          <Panel type={detailType}>
            {/* Detail slide: in from the right trailing the list (open), out to
                the right first (close). The detail-in is the last enter half, so
                its end advances `opening → split`. */}
            <div
              className={cn(
                'flex min-h-0 flex-1 flex-col',
                phase === 'opening' && motionClass('md-detail-in'),
                phase === 'closing' && motionClass('md-detail-out'),
              )}
              onAnimationEnd={(event) => {
                if (event.animationName === 'motion-md-detail-in') setPhase('split')
              }}
            >
              {splitNodes.detail}
            </div>
          </Panel>
        </PanelGroup>
      ) : (
        <PanelGroup layout="inline">
          <Panel type="fill">{table}</Panel>
        </PanelGroup>
      )}

      {tableOverlay && (
        // The table on top, inert, dissolving out (open) or in (close). Kept
        // pointer-events-none so it never blocks the split beneath it. The
        // content-in is the last close half, so its end settles `closing → table`.
        <div className="pointer-events-none absolute inset-0 flex">
          <PanelGroup layout="inline" fill>
            <Panel type="fill">
              <div
                className={cn(
                  'flex min-h-0 flex-1 flex-col',
                  phase === 'opening' && motionClass('md-content-out'),
                  phase === 'closing' && motionClass('md-content-in'),
                )}
                onAnimationEnd={(event) => {
                  if (event.animationName === 'motion-md-content-in') setPhase('table')
                }}
              >
                {table}
              </div>
            </Panel>
          </PanelGroup>
        </div>
      )}
    </div>
  )
}

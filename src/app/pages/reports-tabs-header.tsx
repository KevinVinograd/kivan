import { useEffect, useRef } from 'react'

import { Tabs, TabsList, TabsTrigger } from '@/app/components/components'
import { SectionHeader } from '@/app/components/templates'
import { hasCapability, type Capability } from '@hold/shared'
import { useRole } from '@/app/lib/use-role'
import { useScrollMask } from '@/app/lib/use-scroll-mask'
import { cn } from '@/app/lib/utils'

export type ReportTab = 'resumen' | 'productividad' | 'rentabilidad' | 'carga' | 'finanzas'

const TABS: { value: ReportTab; label: string }[] = [
  { value: 'resumen', label: 'Resumen' },
  { value: 'productividad', label: 'Productividad' },
  { value: 'rentabilidad', label: 'Rentabilidad' },
  { value: 'carga', label: 'Carga de equipo' },
  { value: 'finanzas', label: 'Finanzas operativas' },
]

/** The capability each money-bearing tab requires. A tab absent from this map
 *  needs none (Reportes as a page is already owner/admin-only, and the employee
 *  never reaches it). Keyed per tab rather than one flat "owner-only" set, so the
 *  two money surfaces can be opened or closed independently. */
const TAB_CAPABILITY: Partial<Record<ReportTab, Capability>> = {
  rentabilidad: 'profitability',
  finanzas: 'studioFinancials',
}

/** Whether the session may open a given Reportes tab. Reads the same capabilities as the
 *  server gate on `/reports/profitability`, so a tab is never offered for data the API would
 *  refuse — now the SESSION's effective set, so a custom role narrows the tabs too. */
export function isReportTabAllowed(tab: ReportTab, capabilities: Capability[]): boolean {
  const required = TAB_CAPABILITY[tab]
  return required == null || hasCapability(capabilities, required)
}

/** Movement (px) past which a pointer press counts as a pan, not a tab click. */
const DRAG_THRESHOLD = 6

/**
 * The Reportes view switcher — a `SectionHeader variant="control"` hosting the
 * five-tab navigator. Rendered at the top of the content area below the page
 * header (and at the top of the master-detail navigator on the detail-bearing
 * tabs), mirroring the Cobranza tabs-in-SectionHeader pattern. The tabs drive a
 * shared layout, so no `TabsContent` is paired here.
 *
 * The strip is confined to its container and scrolls horizontally (the
 * `SectionHeader` control leading wrapper allows shrink via `min-w-0`), so it
 * never bleeds out of the narrow master-detail rail into the detail panel. Two
 * affordances move it: a thin token-styled `::-webkit-scrollbar` (idle, shown
 * only while the strip overflows) and click-drag to pan anywhere on the strip.
 *
 * Tab selection is driven here rather than by Radix, because Radix activates a
 * tab inside its `onMouseDown` — which would switch tabs the instant a pan
 * begins. A capture-phase `preventDefault` on press suppresses that built-in
 * activation (composeEventHandlers skips Radix's handler once the event is
 * default-prevented); we then pan on a >6px move, and on a real click (no pan)
 * activate the pressed tab ourselves via its `data-value` and restore focus for
 * keyboard nav. Keyboard activation (arrows + Enter) still flows through Radix.
 * Vertical room is applied only while the strip actually overflows (derived from
 * `useScrollMask` returning a fade class, not `''`): at `md`+ `pb-2` clears the
 * thin scrollbar from the tab chips and `-mt-1 pt-1` gives the active chip's
 * shadow and the focus ring vertical room (overflow clips ink past the content
 * edge). When the tabs fit, that room collapses so the strip sits flush (0px top
 * and bottom). Below `md` (mobile) the room is dropped regardless: touch panning
 * needs no scrollbar gap and keyboard focus is rare there. A short 24px
 * directional edge mask-fade hints at off-screen tabs on whichever side overflows.
 */
export function ReportsTabsHeader({
  activeTab,
  onTabChange,
}: {
  activeTab: ReportTab
  onTabChange: (tab: ReportTab) => void
}) {
  const { capabilities } = useRole()
  const tabs = TABS.filter((tab) => isReportTabAllowed(tab.value, capabilities))
  const scrollRef = useRef<HTMLDivElement>(null)
  // Directional 24px edge fade; the empty-string return doubles as the "no
  // overflow" signal that gates the vertical room (scrollbar gap + chip ink).
  const maskClass = useScrollMask(scrollRef, true, 24)
  const hasOverflow = maskClass !== ''
  const drag = useRef({ down: false, moved: false, startX: 0, startScroll: 0, pointerId: -1 })

  // Keep the active tab in view inside the (possibly scrolled) rail, so opening a
  // detail shows the current tab. Centers it horizontally via scrollBy (rect-
  // based, so it never scrolls the page).
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return
    const active = container.querySelector<HTMLElement>(
      '[data-slot="tabs-trigger"][data-state="active"]',
    )
    if (!active) return
    const containerRect = container.getBoundingClientRect()
    const activeRect = active.getBoundingClientRect()
    const delta = activeRect.left - containerRect.left - (container.clientWidth - activeRect.width) / 2
    container.scrollBy({ left: delta })
  }, [activeTab])

  // Suppress Radix's press-time activation (and the native focus/selection) for a
  // plain left press, so a press can become a pan. Runs in the capture phase, so
  // the trigger's composed onMouseDown sees a default-prevented event and skips.
  const onMouseDownCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button === 0 && !event.ctrlKey && !event.metaKey) event.preventDefault()
  }

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const el = scrollRef.current
    if (!el) return
    drag.current = {
      down: true,
      moved: false,
      startX: event.clientX,
      startScroll: el.scrollLeft,
      pointerId: event.pointerId,
    }
  }

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const state = drag.current
    const el = scrollRef.current
    if (!state.down || !el) return
    const dx = event.clientX - state.startX
    if (!state.moved && Math.abs(dx) > DRAG_THRESHOLD) {
      state.moved = true
      el.setPointerCapture(state.pointerId)
    }
    if (state.moved) el.scrollLeft = state.startScroll - dx
  }

  const endDrag = () => {
    const state = drag.current
    const el = scrollRef.current
    if (el && state.moved && el.hasPointerCapture(state.pointerId)) {
      el.releasePointerCapture(state.pointerId)
    }
    state.down = false
  }

  // A plain click (no pan) selects the pressed tab; a click that ended a pan is
  // ignored. `moved` is reset on the next press, so a swallowed click is safe.
  const onClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (drag.current.moved) return
    const trigger = (event.target as HTMLElement).closest<HTMLElement>('[data-slot="tabs-trigger"]')
    const value = trigger?.dataset.value
    if (!value || trigger?.getAttribute('aria-disabled') === 'true') return
    onTabChange(value as ReportTab)
    trigger?.focus() // restore focus we suppressed on press, for keyboard nav
  }

  return (
    <SectionHeader
      variant="control"
      title="Reportes"
      leading={
        <div
          ref={scrollRef}
          role="region"
          aria-label="Navegación de reportes"
          onMouseDownCapture={onMouseDownCapture}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onClick={onClick}
          className={cn(
            'min-w-0 cursor-grab touch-pan-x overflow-x-auto select-none active:cursor-grabbing',
            '[&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-alpha-emphasis [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-alpha-subtle',
            hasOverflow && 'md:-mt-1 md:pt-1 md:pb-2',
            maskClass,
          )}
        >
          <Tabs
            value={activeTab}
            onValueChange={(value) => onTabChange(value as ReportTab)}
            activationMode="manual"
          >
            <TabsList>
              {tabs.map((tab) => (
                <TabsTrigger key={tab.value} value={tab.value} data-value={tab.value}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      }
    />
  )
}

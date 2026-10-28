import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { cn } from '@/app/lib/utils'
import { TabsList } from '@/app/components/components'
import { KpiTabCard, kpiTabFg } from './kpi-tab-card'
import { useScrollMask } from '@/app/lib/use-scroll-mask'
import { useOffscreenAbove } from '@/app/lib/use-offscreen-above'
import { useScrollDirectionWithin } from '@/app/lib/use-scroll-direction'
import { setKpiPinned } from '@/app/lib/kpi-pinned'

/**
 * Mobile strip chrome: a single horizontally-scrollable row with a token-styled
 * visible scrollbar (mirrors the Reportes tabs rail). `touch-pan-x` keeps vertical
 * page scrolling free while the row pans horizontally. Shared by every mobile KPI
 * tab-card strip (owner / admin / employee dashboards + Operación mensual nav).
 */
export const COMPACT_STRIP =
  'flex gap-3 overflow-x-auto touch-pan-x px-4 py-2 [&::-webkit-scrollbar]:h-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-alpha-emphasis [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-alpha-subtle'

/** One tile in the pinned overlay: a flattened, label-plus-value view of the in-flow KPI card. */
export type PinnedKpiItem = {
  id: string
  label: string
  /** Already-formatted value or short text; `No disponible` for the incomplete state. */
  value: string
  /** Resting fg token for the value line; flipped to `fg-high-contrast` while selected. */
  valueToneClass: string
}

/**
 * Mobile-only wrapper around a KPI tab-card strip. Renders the in-flow naked
 * `TabsList` (the radio card group, now a horizontal-scroll rail with a dynamic
 * edge mask) plus a compact `position: fixed` overlay that pins to the top once
 * the in-flow rail scrolls above the fold.
 *
 * The overlay is an affordance mirror — a quick-jump button group driving the
 * SAME `onSelect` — not a second tablist, so the page `Tabs` stays the single
 * selection source. The in-flow rail is reached via `TabsList asChild` so the
 * scroll element carries a ref without touching the `tabs.tsx` primitive.
 * Render this only on mobile (the caller keeps the desktop grid branch).
 */
export function MobileKpiStrip({
  triggers,
  items,
  selectedId,
  onSelect,
  label,
  stripClassName,
}: {
  /** The in-flow cards (each a naked `TabsTrigger asChild Card`). */
  triggers: ReactNode
  /** Flattened data for the pinned overlay (one per trigger). */
  items: PinnedKpiItem[]
  selectedId: string
  onSelect: (id: string) => void
  /** Accessible name for the pinned quick-jump group. */
  label: string
  /** Extra classes for the in-flow rail (e.g. `shrink-0` inside a bounded flex column). */
  stripClassName?: string
}) {
  const railRef = useRef<HTMLDivElement>(null)
  const maskClass = useScrollMask(railRef)
  const pinned = useOffscreenAbove(railRef)
  // Read the SAME scroll direction as the AppShell nav (resolved from the parent
  // <main> scroller) so the pinned overlay can collapse the nav-reserved band:
  // flush at the top while the nav is hidden, sliding down to make room only when
  // the nav reappears on scroll-up.
  const { hidden: navHidden } = useScrollDirectionWithin(railRef)
  // Tell the shell a frosted band is about to sit directly under its nav. The shell's
  // own band overhangs 48px by default so its glass does not cut off sharply over the
  // content below; with this strip pinned, that overhang would land ON our band and
  // composite the backdrop twice (double blur, 23% + 23% tint). The shell drops the
  // overhang while we are pinned and lets our band continue the glass instead.
  useEffect(() => {
    setKpiPinned(pinned)
    return () => setKpiPinned(false)
  }, [pinned])
  return (
    <>
      <TabsList variant="naked" asChild>
        <div ref={railRef} className={cn(COMPACT_STRIP, maskClass, stripClassName)}>
          {triggers}
        </div>
      </TabsList>
      <KpiPinnedStrip
        items={items}
        selectedId={selectedId}
        onSelect={onSelect}
        visible={pinned}
        navHidden={navHidden}
        label={label}
      />
    </>
  )
}

/**
 * The pinned compact overlay. Portaled to `document.body` so it anchors to the
 * viewport regardless of any transformed ancestor, and never participates in the
 * `<main>` scroller. The container is chromeless (no background, no border) so the
 * cards read as floating above the scrolling content. Stays mounted and toggles
 * `visible` so it can transition in/out; hidden state is inert (`aria-hidden`,
 * `pointer-events-none`, untabbable).
 *
 * Vertical layout tracks the auto-hiding mobile nav (`navHidden`). The container
 * is pinned at `top-0`; a `padding-top` reserves the nav's space only when it is
 * visible: `pt-0` while the nav is hidden (cards flush at the top, no empty band),
 * `pt-15.5` (62px, the nav band height) when it reappears on scroll-up, so the
 * strip's own `py-2` lands the cards exactly 8px below the nav pill.
 * The container starts at `top-0`, but the frosted backdrop is offset to sit BELOW
 * the reserved nav band (`top-15.5` while the nav is visible, `top-0` once it hides)
 * so it never blurs the top-nav pill: under the hero the shell root is `isolate`d,
 * which traps the AppShell header (`z-[35]`) beneath this body-level portal (`z-30`),
 * so a backdrop spanning the nav band would bleed its blur over the pill. The `padding`
 * transition runs on the nav's panel cadence so the nav and cards move together.
 */
function KpiPinnedStrip({
  items,
  selectedId,
  onSelect,
  visible,
  navHidden,
  label,
}: {
  items: PinnedKpiItem[]
  selectedId: string
  onSelect: (id: string) => void
  visible: boolean
  navHidden: boolean
  label: string
}) {
  if (typeof document === 'undefined') return null

  const activate = (id: string) => (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onSelect(id)
    }
  }

  return createPortal(
    <div
      role="group"
      aria-label={label}
      aria-hidden={!visible}
      className={cn(
        'fixed inset-x-0 top-0 z-30 md:hidden',
        // Reserve the nav's space only while it is visible: flush at the top when
        // hidden, cleared exactly to the nav's bottom when shown so the strip's own
        // py-2 forms an 8px gap below the pill. The nav band is 62px (8px header
        // top inset + 54px pill = 24/36 headline + py-2 + 1px borders), which is off
        // the 4px grid, so `pt-15.5` (62px). Keep in sync with the AppShell header.
        navHidden ? 'pt-0' : 'pt-15.5',
        'transition-[padding,opacity,transform] duration-[var(--motion-duration-panel)] ease-[var(--motion-ease-in-out)] motion-reduce:transition-none',
        visible ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0 pointer-events-none',
      )}
    >
      {/* No frosted backdrop here. The glass under these cards is painted by the
          AppShell, as ONE band covering the nav pill AND this strip — see the band in
          `app-shell.tsx` and the `kpi-pinned` channel that tells it we are up. This
          strip used to paint its own, but two `backdrop-filter` boxes cannot be made to
          read as one sheet of glass: each blurs only its own backdrop, so their shared
          edge always shows a seam. Do not reintroduce one. */}
      {/* No edge mask on this rail: it is chromeless and floats over the scroller,
          so an alpha fade would reveal the moving content behind it. The peeking
          partial card is the "more" cue here; the mask lives on the in-flow rail
          (MobileKpiStrip), which fades against the stable page background. */}
      <div className={COMPACT_STRIP}>
        {items.map((item) => {
          const selected = item.id === selectedId
          return (
            <KpiTabCard
              key={item.id}
              selected={selected}
              compact
              className="shrink-0 max-w-[200px]"
              role="button"
              aria-pressed={selected}
              aria-label={item.label}
              tabIndex={visible ? 0 : -1}
              onClick={() => onSelect(item.id)}
              onKeyDown={activate(item.id)}
            >
              <span className={cn('type-caption truncate', kpiTabFg(selected, 'fg-subtle group-hover:fg-default'))}>
                {item.label}
              </span>
              <span className={cn('type-body-2 tabular-nums line-clamp-1', kpiTabFg(selected, item.valueToneClass))}>
                {item.value}
              </span>
            </KpiTabCard>
          )
        })}
      </div>
    </div>,
    document.body,
  )
}

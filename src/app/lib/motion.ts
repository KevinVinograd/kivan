/**
 * Motion System v0 — preset → className mapping.
 *
 * The single bridge between the semantic motion preset a component accepts
 * (`motion="press"`) and the CSS utility that implements it
 * (`.motion-press`, defined in `src/styles/semantics-motion.css`). Components
 * never hand-roll transition/animation classes — they call `motionClass()` so
 * durations, easings, and distances stay centralized in the token layer.
 *
 * Reduced motion, the `hover:hover`/`pointer:fine` gate for magnetic, and the
 * disabled/loading suppression all live in the CSS utilities, so this helper is
 * a pure lookup with no runtime branching.
 */

export type MotionPreset =
  | 'none'
  | 'standard'
  | 'press'
  | 'soft-magnetic'
  | 'panel-enter'
  | 'panel-exit'
  // Master-detail view transition (table <-> list+detail split). `content-dissolve`
  // is the reversible header half (transition, keyed on `data-dissolved`); the
  // `md-*` halves are the component's mount/unmount keyframes driven by a phase
  // machine in MasterDetailLayout. See `semantics-motion.css`.
  | 'content-dissolve'
  | 'md-content-out'
  | 'md-content-in'
  | 'md-list-in'
  | 'md-detail-in'
  | 'md-list-out'
  | 'md-detail-out'

const PRESET_CLASS: Record<MotionPreset, string> = {
  none: '',
  standard: 'motion-standard',
  press: 'motion-press',
  'soft-magnetic': 'motion-soft-magnetic',
  'panel-enter': 'motion-panel-enter',
  // Exit half of the panel motion. The class is inert until the host carries
  // `data-state="closed"`; pair it with `usePresence` so the exit animation
  // runs to completion before the panel unmounts (see MasterDetailLayout).
  'panel-exit': 'motion-panel-exit',
  // Master-detail view transition. `content-dissolve` is the reversible header
  // half (blur + fade + scale-recede, keyed on `data-dissolved`); the `md-*`
  // halves are the component's mount/unmount keyframes (content dissolves, panels
  // slide the full track from their edges, staggered). Orchestrated by the phase
  // machine in MasterDetailLayout.
  'content-dissolve': 'motion-content-dissolve',
  'md-content-out': 'motion-md-content-out',
  'md-content-in': 'motion-md-content-in',
  'md-list-in': 'motion-md-list-in',
  'md-detail-in': 'motion-md-detail-in',
  'md-list-out': 'motion-md-list-out',
  'md-detail-out': 'motion-md-detail-out',
}

/**
 * Resolve a motion preset to its utility class. `none` (and the default) yields
 * the empty string so a component opts out of motion cleanly.
 */
export function motionClass(preset: MotionPreset = 'none'): string {
  return PRESET_CLASS[preset]
}

/**
 * Modifier that raises the magnetic hover lift from the 2px button step to the
 * 4px card step. Apply alongside `motionClass('soft-magnetic')` on large
 * actionable cards (see `semantics-motion.css` → `motion-magnetic-card`).
 */
export const MOTION_MAGNETIC_CARD = 'motion-magnetic-card'

/**
 * Nav-icon hover micro-scale — the one sanctioned transform on the nav rail.
 * Apply to the icon element; mark its row with Tailwind `group` so the scale
 * fires on row hover (fine pointers only). The nav ROW never moves — this scales
 * only the glyph (see `semantics-motion.css` → `motion-nav-icon`). Used by
 * SideNav; gated and reduced-motion-stripped in the CSS.
 */
export const MOTION_NAV_ICON = 'motion-nav-icon'

/** Shared props for components that expose a motion preset. */
export interface MotionProps {
  /** Motion preset applied to this element. See `MotionPreset`. */
  motion?: MotionPreset
  /**
   * Marks the element as a clickable/navigating surface. Gates whether a
   * resting-state component (Card, TableRow, ListItem) receives interaction
   * motion at all.
   */
  interactive?: boolean
}

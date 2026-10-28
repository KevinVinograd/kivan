import { useSyncExternalStore } from 'react'

/**
 * Is a mobile pinned KPI strip currently showing?
 *
 * The AppShell's mobile nav paints a frosted band behind its pill, and the pinned
 * KPI strip paints its own frosted band behind its cards. Both are
 * `backdrop-filter` layers, and they live in different trees — the nav band inside
 * the shell `<header>`, the strip's band inside a `document.body` portal — so
 * neither can see the other. Left alone they OVERLAP: the nav band overhangs 48px
 * below the pill (so its glass does not cut off sharply over the content below),
 * which lands exactly on top of the strip's band. In that overlap the backdrop is
 * blurred twice and tinted twice — 23% + 23% ≈ 41% black — so the glass around the
 * nav reads visibly darker and dirtier than the glass around the cards (measured
 * rgb(181,189,186) vs rgb(239,248,245) in light theme).
 *
 * This is the channel that lets them tile instead of stack: while a strip is
 * pinned, the shell drops the overhang (and its fade) and hands the "continue the
 * glass downwards" job to the strip's band, which already sits directly below it.
 * One tint, one blur, one fade — the two zones then composite identically.
 *
 * A module store (rather than context) because the strip portals to `document.body`
 * and is rendered deep inside a page, while the reader is the shell ABOVE it: this
 * needs no provider and no prop drilling through the page tree.
 */
let pinned = false
const listeners = new Set<() => void>()

/** Called by the pinned strip as it appears / disappears. Idempotent. */
export function setKpiPinned(next: boolean): void {
  if (pinned === next) return
  pinned = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Subscribe to the pinned state. Server snapshot is `false` (no scroll, nothing pinned). */
export function useKpiPinned(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => pinned,
    () => false,
  )
}

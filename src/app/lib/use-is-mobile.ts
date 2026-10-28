import { useEffect, useState } from 'react'

/** The `md` breakpoint boundary: below it (max-width 767px) we are on mobile. */
const MOBILE_QUERY = '(max-width: 767px)'
/** Below the `lg`/desktop boundary (max-width 1023px): mobile AND tablet. The
 *  two-pane master-detail split is too narrow across this whole range, so it
 *  collapses to a single pane here. */
const BELOW_DESKTOP_QUERY = '(max-width: 1023px)'

/**
 * Subscribe to a media query. Reads the match synchronously on the first render
 * (this is a client-only Vite SPA, no SSR), so a portalled surface that mounts on
 * open — a Dialog/AlertDialog bottom sheet, or a Sheet that picks its side from
 * this hook — renders the correct chrome on frame one. Initialising to `false`
 * instead would paint the desktop layout for one frame and then swap, which reads
 * as a horizontal jump mid-animation.
 */
function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false,
  )
  useEffect(() => {
    const mq = window.matchMedia(query)
    const sync = () => setMatches(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [query])
  return matches
}

/**
 * True below the `md` breakpoint (≤767px). Single source of truth for the
 * phone-only boundary shared by the list views and compact strips.
 */
export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY)
}

/**
 * True below the `lg`/desktop breakpoint (≤1023px) — i.e. mobile AND tablet. The
 * master-detail scaffold uses this to collapse its two-pane split to a single
 * pane across the whole tablet range, not just on phones (the detail is too
 * narrow beside the list below desktop width).
 */
export function useIsBelowDesktop(): boolean {
  return useMediaQuery(BELOW_DESKTOP_QUERY)
}

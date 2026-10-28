import { useEffect, useRef, useState, type RefObject } from 'react'

export type ScrollDirectionState = {
  /** True once the user scrolls DOWN past the threshold; reset to false on any
   *  upward scroll or while at the top. Drives auto-hiding chrome. */
  hidden: boolean
  /** True while within `threshold` px of the scroll start. Lets chrome stay flush
   *  (no elevation) at the top and gain elevation once content scrolls under it. */
  atTop: boolean
}

/**
 * Shared direction step: reads `el.scrollTop`, applies the ±2px dead zone, and
 * pushes the next {hidden, atTop} into `setState` (referentially stable on a
 * no-op so consumers re-render only on a real change). Used by both hooks below
 * so the in-scroller and within-child variants stay perfectly aligned.
 */
function trackDirection(
  el: HTMLElement,
  lastY: { current: number },
  threshold: number,
  setState: (updater: (prev: ScrollDirectionState) => ScrollDirectionState) => void,
) {
  const y = el.scrollTop
  const atTop = y <= threshold
  const delta = y - lastY.current
  lastY.current = y
  setState((prev) => {
    let hidden = prev.hidden
    if (atTop) hidden = false
    else if (delta > 2) hidden = true
    else if (delta < -2) hidden = false
    return prev.hidden === hidden && prev.atTop === atTop ? prev : { hidden, atTop }
  })
}

/**
 * Tracks the scroll DIRECTION of a scroll container (not the window) so floating
 * chrome can auto-hide on the way down and reappear on the way up. Listens
 * passively on the element from `ref`; it is a no-op until that element mounts.
 *
 * A small dead zone (±2px) absorbs sub-pixel/elastic jitter so the hidden state
 * does not flicker. The returned object is referentially stable across scrolls
 * that do not change either flag, so consumers re-render only on a real change.
 */
export function useScrollDirection(
  ref: RefObject<HTMLElement | null>,
  threshold = 8,
): ScrollDirectionState {
  const [state, setState] = useState<ScrollDirectionState>({ hidden: false, atTop: true })
  const lastY = useRef(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const onScroll = () => trackDirection(el, lastY, threshold, setState)

    onScroll()
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [ref, threshold])

  return state
}

/**
 * Same as `useScrollDirection`, but resolves the scroll container from a CHILD
 * ref by walking up to the nearest `<main>` (mirroring `useOffscreenAbove`). Lets
 * chrome that lives OUTSIDE the scroller (e.g. a portaled overlay) read the same
 * scroll direction as the shell, so it can move in sync with the auto-hiding nav.
 * Same ±2px dead zone and defaults, so both stay aligned. No-op until the child
 * mounts and a `<main>` ancestor exists.
 */
export function useScrollDirectionWithin(
  childRef: RefObject<HTMLElement | null>,
  threshold = 8,
): ScrollDirectionState {
  const [state, setState] = useState<ScrollDirectionState>({ hidden: false, atTop: true })
  const lastY = useRef(0)

  useEffect(() => {
    const el = childRef.current?.closest('main')
    if (!el) return

    const onScroll = () => trackDirection(el, lastY, threshold, setState)

    onScroll()
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [childRef, threshold])

  return state
}

import { useEffect, useState, type RefObject } from 'react'

/**
 * `true` once `ref` has scrolled entirely above the top of its nearest `<main>`
 * scroll container — i.e. the element left the viewport upward. Drives the
 * mobile pinned KPI bar: when the in-flow strip scrolls away, the `position:
 * fixed` overlay takes over.
 *
 * Uses an `IntersectionObserver` rooted at the `<main>` scroller rather than a
 * scroll listener on `<main>`. A `position: sticky` element inside that scroller
 * stalled touch scroll (the regression reverted in `04894cf`); an overlay driven
 * by an observer keeps the scroller untouched. While `enabled` is false (e.g.
 * desktop) the hook observes nothing and returns `false`.
 */
export function useOffscreenAbove(ref: RefObject<HTMLElement | null>, enabled = true): boolean {
  const [above, setAbove] = useState(false)

  useEffect(() => {
    if (!enabled) {
      setAbove(false)
      return
    }
    const el = ref.current
    if (!el) return
    const root = el.closest('main')
    const observer = new IntersectionObserver(
      ([entry]) => {
        const rootTop = entry.rootBounds?.top ?? 0
        // Fully above the scroller's top edge (not merely scrolled out below).
        setAbove(!entry.isIntersecting && entry.boundingClientRect.bottom <= rootTop)
      },
      { root, threshold: 0 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [enabled, ref])

  return enabled && above
}

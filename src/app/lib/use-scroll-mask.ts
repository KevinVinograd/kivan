import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

/** Fade-band width (px) — selects the `-24` / `-32` utility suffix. */
export type ScrollMaskBand = 24 | 32

/**
 * Which edges may fade. `both` is the default affordance. `leading` suppresses
 * the trailing fade for a scroller that pins an opaque control column to its
 * trailing edge (Table's `maskTrailingEdge={false}` / DataTable's
 * `pinActionsColumn`): a container mask fades EVERY descendant at that edge,
 * including a `position: sticky` cell, which would leave an interactive control
 * washed out but still clickable. Those scrollers cue the trailing edge with the
 * pinned cell's own leading-edge band instead.
 */
export type ScrollMaskEdges = 'both' | 'leading'

/**
 * Directional edge-fade class for a horizontal-scroll affordance, or `''` when
 * the element does not overflow. Maps 1:1 to the `.mask-fade-*-{24,32}` utilities
 * in `src/styles/semantics-gradients.css`; the band is chosen by the hook's
 * `band` argument (32px default).
 */
export type ScrollMaskClass =
  | ''
  | `mask-fade-right-${ScrollMaskBand}`
  | `mask-fade-left-${ScrollMaskBand}`
  | `mask-fade-both-${ScrollMaskBand}`

/** Sub-pixel slack so a fully-scrolled rail still reads as "at the edge". */
const EPSILON = 1

/**
 * Tracks the horizontal scroll position of `ref` and returns which edge fade to
 * apply at the given `band` width (px): `mask-fade-right-{band}` at scroll-start
 * (more content to the right), `mask-fade-both-{band}` mid-scroll,
 * `mask-fade-left-{band}` at scroll-end, and `''` when the content fits (no
 * overflow). With `edges: 'leading'` only the leading fade is ever returned —
 * `mask-fade-left-{band}` once scrolled off the start, `''` otherwise.
 *
 * CAUTION: in `leading` mode `''` is ambiguous — it means BOTH "the content fits"
 * and "it overflows but sits at scroll-start". The `hasOverflow = maskClass !== ''`
 * idiom (see `reports-tabs-header.tsx`) is therefore only valid in `both` mode. A
 * `leading` consumer that needs an overflow flag must measure it itself.
 *
 * The scroll listener is rAF-throttled and passive. Overflow is re-measured on
 * `scroll`, on window `resize`, AND via a `ResizeObserver` on the scroller and
 * its content: a grid's `scrollWidth` also changes without a window resize when
 * columns are hidden/shown, filtered, or paginated, and a scroll-only listener
 * would leave the mask stale in exactly those cases.
 *
 * While `enabled` is false (e.g. desktop, where the rail is a grid) the hook
 * attaches nothing and returns `''`.
 */
export function useScrollMask(
  ref: RefObject<HTMLElement | null>,
  enabled = true,
  band: ScrollMaskBand = 32,
  edges: ScrollMaskEdges = 'both',
): ScrollMaskClass {
  const [mask, setMask] = useState<ScrollMaskClass>('')
  const frame = useRef(0)

  const measure = useCallback(() => {
    frame.current = 0
    const el = ref.current
    if (!el) return
    const { scrollLeft, clientWidth, scrollWidth } = el
    if (scrollWidth - clientWidth <= EPSILON) {
      setMask('')
      return
    }
    const atStart = scrollLeft <= EPSILON
    const atEnd = scrollLeft >= scrollWidth - clientWidth - EPSILON

    if (edges === 'leading') {
      setMask(atStart ? '' : `mask-fade-left-${band}`)
      return
    }

    setMask(
      atStart
        ? `mask-fade-right-${band}`
        : atEnd
          ? `mask-fade-left-${band}`
          : `mask-fade-both-${band}`,
    )
  }, [ref, band, edges])

  useEffect(() => {
    if (!enabled) {
      setMask('')
      return
    }
    const el = ref.current
    if (!el) return
    const schedule = () => {
      if (frame.current) return
      frame.current = requestAnimationFrame(measure)
    }
    el.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule, { passive: true })
    // The scroller's box and its content's box move independently — observe both.
    const observer = new ResizeObserver(schedule)
    observer.observe(el)
    if (el.firstElementChild) observer.observe(el.firstElementChild)
    measure()
    return () => {
      el.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      observer.disconnect()
      if (frame.current) cancelAnimationFrame(frame.current)
    }
  }, [enabled, ref, measure])

  return enabled ? mask : ''
}

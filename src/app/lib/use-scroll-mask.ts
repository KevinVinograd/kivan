import { useCallback, useEffect, useRef, useState, type RefObject } from 'react'

export type ScrollMaskBand = 24 | 32

export type ScrollMaskEdges = 'both' | 'leading'

export type ScrollMaskClass =
  | ''
  | `mask-fade-right-${ScrollMaskBand}`
  | `mask-fade-left-${ScrollMaskBand}`
  | `mask-fade-both-${ScrollMaskBand}`

const EPSILON = 1

// In 'leading' mode '' means both "fits" and "at scroll start": measure overflow separately there.
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

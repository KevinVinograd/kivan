import { useEffect, useRef, type RefObject } from 'react'
import type { Moment } from './daytime-context'

const SCROLL_RANGE = 460

export type DaytimeHeroProps = {
  moment: Moment
  scrollerRef: RefObject<HTMLElement | null>
}

export function DaytimeHero({ moment, scrollerRef }: DaytimeHeroProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    const scroller = scrollerRef.current
    if (!el || !scroller) return

    let raf = 0
    const update = () => {
      raf = 0
      const progress = Math.min(1, Math.max(0, scroller.scrollTop / SCROLL_RANGE))
      el.style.setProperty('--hero-scroll', progress.toFixed(3))
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }

    update()
    scroller.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      scroller.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [scrollerRef])

  return <div ref={ref} className="daytime-hero bg-gradient-daytime" data-moment={moment} aria-hidden />
}

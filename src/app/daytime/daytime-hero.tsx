import { useEffect, useRef, type RefObject } from 'react'
import type { Moment } from './daytime-context'

/** Pixels of scroll over which the wash fades out (and, symmetrically, how far you
    scroll before it's fully gone). Smaller = fades faster. */
const SCROLL_RANGE = 460

export type DaytimeHeroProps = {
  /** The active moment; drives the palette + rays via the [data-moment] enum. */
  moment: Moment
  /** The app-shell scroll container (`<main>`); its scrollTop drives the fade. */
  scrollerRef: RefObject<HTMLElement | null>
}

/**
 * The full-bleed time-of-day background layer. Renders a single decorative element
 * (`.daytime-hero.bg-gradient-daytime`) pinned to the top of the app shell, behind
 * the transparent content region. It publishes `--hero-scroll` (0 → 1) onto itself
 * from the shell's `<main>` scroll position so the CSS opacity fade is driven without
 * any JS-animated style. `--hero-scroll` is set imperatively via the element ref (not
 * a JSX `style` prop) so it stays within the design-system lint rules.
 *
 * Mounted by AppShell only on the dashboard route; purely presentational + aria-hidden.
 */
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

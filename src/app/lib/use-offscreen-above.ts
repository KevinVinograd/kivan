import { useEffect, useState, type RefObject } from 'react'

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
        setAbove(!entry.isIntersecting && entry.boundingClientRect.bottom <= rootTop)
      },
      { root, threshold: 0 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [enabled, ref])

  return enabled && above
}

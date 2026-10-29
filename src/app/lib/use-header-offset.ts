import { useCallback, useRef } from 'react'

export function useHeaderOffset<H extends HTMLElement, R extends HTMLElement>() {
  const header = useRef<H | null>(null)
  const region = useRef<R | null>(null)
  const observer = useRef<ResizeObserver | null>(null)

  const sync = useCallback(() => {
    if (header.current && region.current) {
      region.current.style.setProperty('--md-table-offset', `${header.current.offsetHeight}px`)
    }
  }, [])

  const headerRef = useCallback(
    (node: H | null) => {
      observer.current?.disconnect()
      observer.current = null
      header.current = node
      if (!node) return
      const ro = new ResizeObserver(sync)
      ro.observe(node)
      observer.current = ro
      sync()
    },
    [sync],
  )

  const regionRef = useCallback(
    (node: R | null) => {
      region.current = node
      if (node) sync()
    },
    [sync],
  )

  return [headerRef, regionRef] as const
}

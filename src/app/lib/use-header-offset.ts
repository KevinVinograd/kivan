import { useCallback, useRef } from 'react'

/**
 * Master-detail table-offset compensation.
 *
 * While the split is open the content layer fills the whole region over the
 * faded page header, so the table that is dissolving out must stay anchored
 * where it sat under the header (otherwise it lurches up as it fades). This
 * measures the header wrapper and publishes its height as the `--md-table-offset`
 * CSS variable on the region, for the table slot to consume while dissolved
 * (`pt-[var(--md-table-offset)]`). The list/detail panels do not consume it, so
 * they still fill from the top with no gap.
 *
 * The variable is set imperatively (the `style` prop is forbidden on DOM nodes)
 * and kept live with a ResizeObserver, since the header height changes with the
 * breadcrumb / breakpoint. Both are attached via CALLBACK refs so the observer
 * re-establishes and the variable re-publishes whenever the region/header
 * re-mount (e.g. a page that renders the region only for some roles). Returns
 * `[headerRef, regionRef]`: attach `headerRef` to the header wrapper being
 * measured and `regionRef` to the positioned region that owns the variable (an
 * ancestor of the table slot).
 */
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

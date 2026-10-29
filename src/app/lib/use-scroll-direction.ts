import { useEffect, useRef, useState, type RefObject } from 'react'

export type ScrollDirectionState = {
  hidden: boolean
  atTop: boolean
}

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

import { useEffect, useRef, useState, type RefObject } from 'react'

/**
 * Deferred-unmount presence for CSS exit animations on non-Radix structural
 * elements (panels). It is the minimal core of Radix `Presence` without the
 * dependency or the `cloneElement`/ref-injection plumbing: while `present` is
 * true the node stays mounted; when `present` flips to false the node is kept
 * mounted until its exit animation ends, then unmounts.
 *
 * Reduced motion needs no special-casing here. The reduced-motion strip in
 * `semantics-motion.css` zeroes the exit animation (`.motion-panel-exit {
 * animation: none }`), so the host reports `animation-name: none` and we unmount
 * on the same tick — no slide, no delayed unmount, no stuck panel. The same
 * immediate path covers any host that defines no exit animation at all.
 *
 * Usage (the consumer owns `data-state` so the CSS knows which half to play):
 *   const { ref, mounted } = usePresence<HTMLDivElement>(open)
 *   if (!mounted) return null
 *   return (
 *     <div ref={ref} data-state={open ? 'open' : 'closed'} className="motion-panel-exit">
 *       {content}
 *     </div>
 *   )
 *
 * The host must keep a stable identity across re-renders (do not key it by the
 * selected id) so reopening or switching content never replays an animation.
 */
export function usePresence<T extends HTMLElement = HTMLElement>(present: boolean): {
  ref: RefObject<T>
  mounted: boolean
} {
  const ref = useRef<T>(null)
  const [mounted, setMounted] = useState(present)

  useEffect(() => {
    if (present) {
      setMounted(true)
      return
    }

    const node = ref.current
    // No node, or no exit animation defined (this also covers
    // prefers-reduced-motion, which strips the animation to `none`): unmount
    // immediately instead of waiting for an animationend that will never fire.
    if (!node || getComputedStyle(node).animationName === 'none') {
      setMounted(false)
      return
    }

    const handleEnd = (event: AnimationEvent) => {
      // Ignore animationend events bubbling up from descendant content.
      if (event.target === node) setMounted(false)
    }
    node.addEventListener('animationend', handleEnd)
    node.addEventListener('animationcancel', handleEnd)
    return () => {
      node.removeEventListener('animationend', handleEnd)
      node.removeEventListener('animationcancel', handleEnd)
    }
  }, [present])

  return { ref, mounted }
}

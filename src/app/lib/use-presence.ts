import { useEffect, useRef, useState, type RefObject } from 'react'

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
    if (!node || getComputedStyle(node).animationName === 'none') {
      setMounted(false)
      return
    }

    const handleEnd = (event: AnimationEvent) => {
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

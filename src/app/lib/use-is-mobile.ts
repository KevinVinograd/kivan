import { useEffect, useState } from 'react'

const MOBILE_QUERY = '(max-width: 767px)'
const BELOW_DESKTOP_QUERY = '(max-width: 1023px)'

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia(query).matches
      : false,
  )
  useEffect(() => {
    const mq = window.matchMedia(query)
    const sync = () => setMatches(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [query])
  return matches
}

export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY)
}

export function useIsBelowDesktop(): boolean {
  return useMediaQuery(BELOW_DESKTOP_QUERY)
}

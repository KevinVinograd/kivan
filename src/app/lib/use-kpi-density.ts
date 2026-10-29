import { useCallback, useState } from 'react'

const STORAGE_PREFIX = 'kpi-density:'

function readStoredDense(storageKey: string | undefined): boolean | undefined {
  if (!storageKey || typeof window === 'undefined') return undefined
  try {
    const stored = window.localStorage.getItem(`${STORAGE_PREFIX}${storageKey}`)
    if (stored === 'dense') return true
    if (stored === 'comfortable') return false
    return undefined
  } catch {
    return undefined
  }
}

export function useKpiDensity({
  dense = false,
  storageKey,
}: {
  dense?: boolean
  storageKey?: string
}): { isDense: boolean; toggleDense: () => void } {
  const [isDense, setIsDense] = useState(() => readStoredDense(storageKey) ?? dense)

  const toggleDense = useCallback(() => {
    setIsDense((current) => {
      const next = !current
      if (storageKey && typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(`${STORAGE_PREFIX}${storageKey}`, next ? 'dense' : 'comfortable')
        } catch {
        }
      }
      return next
    })
  }, [storageKey])

  return { isDense, toggleDense }
}

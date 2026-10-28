import { useCallback, useState } from 'react'

const STORAGE_PREFIX = 'kpi-density:'

/**
 * Read the persisted density for one card. Returns `undefined` when there is no
 * stored preference (or no storage at all — SSR, private mode, a browser that
 * throws on access), so the caller falls back to the author's default.
 */
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

/**
 * Density state for a KpiSummaryCard: the author declares the default via `dense`,
 * the reader overrides it with the collapse toggle, and the override is persisted
 * per card so the choice survives a reload.
 *
 * Persistence is opt-in — it happens only when a `storageKey` is given. Without one
 * the toggle still works, it just resets to the author's default on the next mount.
 * The stored value is read once, in the state initializer, so a card never flashes
 * the author's default before swapping to the reader's choice.
 */
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
          // Storage unavailable (private mode / quota). The toggle still works for
          // this session; only the persistence is lost.
        }
      }
      return next
    })
  }, [storageKey])

  return { isDense, toggleDense }
}

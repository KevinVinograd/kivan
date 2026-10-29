import { useSyncExternalStore } from 'react'

let pinned = false
const listeners = new Set<() => void>()

export function setKpiPinned(next: boolean): void {
  if (pinned === next) return
  pinned = next
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useKpiPinned(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => pinned,
    () => false,
  )
}

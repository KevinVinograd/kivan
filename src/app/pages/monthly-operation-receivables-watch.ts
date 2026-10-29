export type ReceivablesWatch = {
  seen: number
  refresh: boolean
}

export function nextReceivablesWatch(seen: number, updatedAt: number): ReceivablesWatch {
  if (updatedAt === 0) return { seen, refresh: false }
  if (seen === 0) return { seen: updatedAt, refresh: false }
  if (updatedAt <= seen) return { seen, refresh: false }
  return { seen: updatedAt, refresh: true }
}

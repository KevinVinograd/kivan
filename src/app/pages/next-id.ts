function numericSuffix(id: string): number {
  return Number(id.replace(/\D/g, '')) || 0
}

export function nextSequentialId(
  prefix: string,
  existing: ReadonlyArray<{ id: string }>,
): string {
  const max = existing
    .filter((row) => row.id.startsWith(`${prefix}-`))
    .reduce((highest, row) => Math.max(highest, numericSuffix(row.id)), 0)
  return `${prefix}-${String(max + 1).padStart(3, '0')}`
}

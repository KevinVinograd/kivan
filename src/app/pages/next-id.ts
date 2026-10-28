/**
 * Sequential id minting for runtime-created records. Keeps the seed's
 * `<prefix>-NNN` numeric convention so the deterministic invoice-number / CAE synth
 * (which parses the numeric suffix of an id, e.g. `rec-007` -> 7) stays correct for
 * records created at runtime. Replaces the prior `crypto.randomUUID()` mints, whose
 * non-numeric ids made the synth produce garbage. Created ids continue the global
 * max suffix for the prefix (not the period block) — unique and synth-safe.
 * Mock-only; a real backend will own id generation.
 */

/** Numeric suffix of an id (`rec-007` -> 7); mirrors the synth's `seedNum`. */
function numericSuffix(id: string): number {
  return Number(id.replace(/\D/g, '')) || 0
}

/**
 * Next sequential id for `prefix`, formatted `<prefix>-NNN` (min 3 digits). Scans
 * the rows whose id starts with `<prefix>-`, takes the max numeric suffix and adds
 * one. An empty set yields `<prefix>-001`.
 */
export function nextSequentialId(
  prefix: string,
  existing: ReadonlyArray<{ id: string }>,
): string {
  const max = existing
    .filter((row) => row.id.startsWith(`${prefix}-`))
    .reduce((highest, row) => Math.max(highest, numericSuffix(row.id)), 0)
  return `${prefix}-${String(max + 1).padStart(3, '0')}`
}

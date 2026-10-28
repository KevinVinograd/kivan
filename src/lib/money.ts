/**
 * Money at the UI edge. The API speaks integer MINOR UNITS as a base-10 string
 * (`@hold/shared/money`); the screens render and edit pesos. These two functions are
 * the ONLY place that crossing happens.
 *
 * They lived copy-pasted in five `*-api-data` modules — same body, two slightly different
 * signatures — which is how one of them ends up rounding differently from the rest and a
 * figure disagrees with itself across two tabs.
 *
 * `toMinor` rounds: a peso amount typed into an input can carry float noise
 * (`19.99 * 100 = 1998.9999…`), and truncating it would quietly lose a centavo per row.
 */
export const toMajor = (minor: string | null | undefined): number =>
  minor ? Number(minor) / 100 : 0

export const toMinor = (pesos: number): string => String(Math.round(pesos * 100))

export const toMajor = (minor: string | null | undefined): number =>
  minor ? Number(minor) / 100 : 0

export const toMinor = (pesos: number): string => String(Math.round(pesos * 100))

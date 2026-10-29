import { SERVICE_CATALOG } from './clients-mock-data'
import type { MonthlyFeeCandidate } from './receivables-api-data'

export type GenerarMesRow = MonthlyFeeCandidate & {
  selected: boolean
  service: string
  selectedLineIds: string[] | null
  selectedProductionIds: string[]
}

export function linesOf(row: GenerarMesRow): { id: string; name: string; price: number }[] {
  return row.lines ?? []
}

export function hasPricedLines(row: GenerarMesRow): boolean {
  return (row.lines?.length ?? 0) > 0
}

export function isItemized(row: GenerarMesRow): boolean {
  return hasPricedLines(row) || row.productions.length > 0
}

export function needsServicePick(row: GenerarMesRow): boolean {
  return !hasPricedLines(row) && row.monthlyFee > 0
}

export function selectedProductionsOf(row: GenerarMesRow): GenerarMesRow['productions'] {
  return row.productions.filter((p) => row.selectedProductionIds.includes(p.id))
}

export function selectedLinesOf(row: GenerarMesRow): { id: string; name: string; price: number }[] {
  if (row.selectedLineIds === null) return []
  return linesOf(row).filter((l) => row.selectedLineIds!.includes(l.id))
}

export function serviceLabelFor(row: GenerarMesRow): string {
  if (!isItemized(row) || (!hasPricedLines(row) && row.monthlyFee > 0)) return row.service
  const selected = selectedLinesOf(row)
  if (selected.length === 1) return selected[0]!.name
  if (selected.length > 1) return 'Abono mensual'
  const productions = selectedProductionsOf(row)
  if (productions.length === 0) return ''
  const names = [...new Set(productions.map((p) => p.serviceName))]
  return names.length === 1 ? names[0]! : 'Producciones'
}

export function emptySelectionFrom(rows: GenerarMesRow[]): GenerarMesRow[] {
  return rows.filter(
    (row) =>
      row.selected &&
      row.skipReason === null &&
      isItemized(row) &&
      (row.selectedLineIds?.length ?? 0) === 0 &&
      row.selectedProductionIds.length === 0 &&
      (hasPricedLines(row) || row.monthlyFee === 0),
  )
}

export function billedAmount(row: GenerarMesRow): { amount: number; currency: string } {
  const currency = row.convertedArs === null ? row.currency : 'ARS'
  const lines = linesOf(row)
  const retainer =
    row.selectedLineIds === null || lines.length === 0
      ? row.monthlyFee
      : lines
          .filter((l) => row.selectedLineIds!.includes(l.id))
          .reduce((sum, l) => sum + l.price, 0)
  const contracted = retainer + selectedProductionsOf(row).reduce((sum, p) => sum + p.amount, 0)
  const grossFull = row.convertedArs ?? row.monthlyFee
  const gross =
    row.convertedArs === null
      ? contracted
      : row.monthlyFee === 0
        ? contracted * (row.arsPerUsd ?? 0)
        : (grossFull * contracted) / row.monthlyFee
  const baseMinor = Math.round(gross * 100)
  const discountMinor = row.discountPercent
    ? Math.floor((baseMinor * Math.round(row.discountPercent * 100)) / 10_000)
    : 0
  return { amount: Math.max(baseMinor - discountMinor, 0) / 100, currency }
}

export function nameList(names: string[]): string {
  if (names.length <= 3) return names.join(', ')
  return `${names.slice(0, 3).join(', ')} y ${names.length - 3} más`
}

export function serviceOptionsFor(row: GenerarMesRow): string[] {
  return row.services.length > 0 ? row.services : [...SERVICE_CATALOG]
}

export function opensTicked(candidate: MonthlyFeeCandidate): boolean {
  if ((candidate.lines?.length ?? 0) > 0 || candidate.productions.length > 0) {
    return candidate.skipReason === null
  }
  return candidate.skipReason === null && candidate.suggestedService !== null
}

export function mergeRows(
  items: MonthlyFeeCandidate[],
  previous: GenerarMesRow[] | null,
): GenerarMesRow[] {
  const kept = new Map((previous ?? []).map((row) => [row.clientId, row]))
  return items.map((item) => {
    const prior = kept.get(item.clientId)
    const allLineIds = item.lines === null ? null : item.lines.map((l) => l.id)
    const allProductionIds = item.productions.map((p) => p.id)
    if (!prior || prior.skipReason !== null) {
      return {
        ...item,
        selected: opensTicked(item),
        service: item.suggestedService ?? '',
        selectedLineIds: allLineIds,
        selectedProductionIds: allProductionIds,
      }
    }
    return {
      ...item,
      selected: item.skipReason === null && prior.selected,
      service: prior.service || item.suggestedService || '',
      selectedLineIds:
        prior.selectedLineIds === null || allLineIds === null
          ? allLineIds
          : prior.selectedLineIds.filter((id) => allLineIds.includes(id)),
      selectedProductionIds: prior.selectedProductionIds.filter((id) => allProductionIds.includes(id)),
    }
  })
}

export function clashesWithManual(row: GenerarMesRow): boolean {
  if (row.manualServices.length === 0) return false
  if (hasPricedLines(row)) {
    return selectedLinesOf(row).some((l) => row.manualServices.includes(l.name))
  }
  if (row.productions.length > 0 && row.monthlyFee === 0) return false
  const wouldBill = row.service || row.suggestedService
  return wouldBill !== null && wouldBill !== '' && row.manualServices.includes(wouldBill)
}

export function mayDuplicateByGuess(row: GenerarMesRow): boolean {
  return (
    row.services.length === 0 &&
    row.manualServices.length > 0 &&
    row.service !== '' &&
    !clashesWithManual(row)
  )
}

export function chosenFrom(rows: GenerarMesRow[]): GenerarMesRow[] {
  return rows.filter(
    (row) =>
      row.selected &&
      row.skipReason === null &&
      serviceLabelFor(row) !== '' &&
      !clashesWithManual(row),
  )
}

export function unresolvedFrom(rows: GenerarMesRow[]): GenerarMesRow[] {
  return rows.filter(
    (row) =>
      row.selected &&
      row.skipReason === null &&
      needsServicePick(row) &&
      serviceLabelFor(row) === '',
  )
}

export function selectableFrom(rows: GenerarMesRow[]): GenerarMesRow[] {
  return rows.filter((row) => row.skipReason === null)
}

export function canGenerate(rows: GenerarMesRow[], dueDate: string): boolean {
  return chosenFrom(rows).length > 0 && dueDate !== ''
}

export function disabledReasonFor(rows: GenerarMesRow[], dueDate: string): string | null {
  if (dueDate === '') return 'Elegí la fecha de vencimiento'
  if (chosenFrom(rows).length > 0) return null
  if (rows.length > 0 && selectableFrom(rows).length === 0) {
    if (rows.every((row) => row.skipReason === 'already_generated')) {
      return 'Ya se generaron los cobros de este mes'
    }
    if (rows.some((row) => row.skipReason === 'missing_exchange_rate')) {
      return 'Cargá la cotización del dólar para generar estos cobros'
    }
    return 'Todos los clientes ya tienen su cobro de este mes'
  }
  const clashing = rows.filter(
    (row) =>
      row.selected &&
      row.skipReason === null &&
      row.service !== '' &&
      clashesWithManual(row),
  )
  if (clashing.length > 0) {
    const named = nameList(clashing.map((row) => row.clientName))
    const unsatisfiable = clashing.every((row) =>
      serviceOptionsFor(row).every((service) => clashesWithManual({ ...row, service })),
    )
    if (unsatisfiable) {
      return clashing.length === 1
        ? `${named} ya tiene todos sus servicios cargados a mano, desmarcalo`
        : `Ya tienen todos sus servicios cargados a mano, desmarcalos: ${named}`
    }
    return clashing.length === 1
      ? `${named} ya tiene ese servicio cargado a mano, elegí otro`
      : `Ya tienen ese servicio cargado a mano, elegí otro: ${named}`
  }
  if (unresolvedFrom(rows).length > 0) return 'Elegí el servicio de los clientes seleccionados'
  if (emptySelectionFrom(rows).length > 0) {
    const names = nameList(emptySelectionFrom(rows).map((row) => row.clientName))
    return emptySelectionFrom(rows).length === 1
      ? `Tildá al menos un servicio de ${names}, o desmarcá el cliente`
      : `Tildá al menos un servicio, o desmarcá los clientes: ${names}`
  }
  return 'Elegí al menos un cliente y su servicio'
}

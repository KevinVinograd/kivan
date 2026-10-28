/**
 * The batch bar of the Producciones tab: approve what the communication leads confirmed,
 * and settle the week's viáticos.
 *
 * Each action applies only to the selected rows it makes sense for, and says how many.
 * Approving is locked on a closed month and skips productions already on a cobro;
 * paying back viáticos is not locked (HOLD pays them weekly, after the month closes too).
 */
import { Button } from '@/app/components/components'
import { todayIso } from '@/app/lib/iso-date'
import type { ProductionRecord } from './monthly-operation-mock-data'
import { formatCurrency } from './monthly-operation-format'

/** Selected rows each action would touch. */
export function bulkTargets(selected: ProductionRecord[], locked: boolean) {
  const open = locked ? [] : selected.filter((p) => !p.receivableId)
  return {
    toApprove: open.filter((p) => p.status === 'pending'),
    toUnapprove: open.filter((p) => p.status === 'approved'),
    viaticsOwed: selected.filter((p) => p.viatics > 0 && !p.viaticsPaidAt),
    viaticsPaid: selected.filter((p) => p.viatics > 0 && p.viaticsPaidAt),
  }
}

export function ProductionsBulkBar({
  selected,
  locked,
  busy,
  onApprove,
  onMarkViatics,
  onClear,
}: {
  selected: ProductionRecord[]
  locked: boolean
  busy: boolean
  onApprove: (productions: ProductionRecord[], approved: boolean) => void
  onMarkViatics: (productions: ProductionRecord[], paidAt: string | null) => void
  onClear: () => void
}) {
  if (selected.length === 0) return null
  const t = bulkTargets(selected, locked)
  const owedTotal = t.viaticsOwed.reduce((sum, p) => sum + p.viatics, 0)
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-control bg-reverse px-3 py-2">
      <span className="type-caption fg-reverse-subtle">
        {selected.length === 1 ? '1 seleccionada' : `${selected.length} seleccionadas`}
      </span>
      <Button variant="transparent" color="inverse" size="dense" onClick={onClear} disabled={busy}>
        Limpiar
      </Button>
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {t.toUnapprove.length > 0 ? (
          <Button variant="outlined" color="inverse" size="dense" disabled={busy} onClick={() => onApprove(t.toUnapprove, false)}>
            {`Quitar aprobación (${t.toUnapprove.length})`}
          </Button>
        ) : null}
        {t.viaticsPaid.length > 0 ? (
          <Button variant="outlined" color="inverse" size="dense" disabled={busy} onClick={() => onMarkViatics(t.viaticsPaid, null)}>
            {`Viáticos sin pagar (${t.viaticsPaid.length})`}
          </Button>
        ) : null}
        {t.viaticsOwed.length > 0 ? (
          <Button variant="outlined" color="inverse" size="dense" disabled={busy} onClick={() => onMarkViatics(t.viaticsOwed, todayIso())}>
            {`Viáticos pagados hoy · ${formatCurrency(owedTotal)}`}
          </Button>
        ) : null}
        {t.toApprove.length > 0 ? (
          <Button variant="solid" color="inverse" size="dense" disabled={busy} onClick={() => onApprove(t.toApprove, true)}>
            {`Aprobar (${t.toApprove.length})`}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

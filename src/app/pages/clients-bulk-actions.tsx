import { Button } from '@/app/components/components'
import type { Client } from './clients-mock-data'

export type ClientsBulkActionsProps = {
  /** The currently selected clients; the bar hides itself when empty. */
  clients: Client[]
  onInvoice: (clients: Client[]) => void
  onChangeStatus: (clients: Client[]) => void
  onExport: (clients: Client[]) => void
  /** Optional "Limpiar" affordance to clear the selection. */
  onClear?: () => void
}

/**
 * Selection bulk-action bar shared by the table toolbar and the master-detail
 * list, so the count + Facturar / Cambiar estado / Exportar actions live in one
 * place instead of being duplicated per view. Renders nothing when the selection
 * is empty. Styled as a reverse (dark) bar with inverse controls.
 */
export function ClientsBulkActions({
  clients,
  onInvoice,
  onChangeStatus,
  onExport,
  onClear,
}: ClientsBulkActionsProps) {
  if (clients.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-control bg-reverse px-3 py-2">
      <span className="type-caption fg-reverse-subtle">{clients.length} seleccionados</span>
      {onClear ? (
        <Button variant="transparent" color="inverse" size="dense" onClick={onClear}>
          Limpiar
        </Button>
      ) : null}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Button variant="outlined" color="inverse" size="dense" onClick={() => onInvoice(clients)}>
          Facturar
        </Button>
        <Button variant="outlined" color="inverse" size="dense" onClick={() => onChangeStatus(clients)}>
          Cambiar estado
        </Button>
        <Button variant="outlined" color="inverse" size="dense" onClick={() => onExport(clients)}>
          Exportar
        </Button>
      </div>
    </div>
  )
}

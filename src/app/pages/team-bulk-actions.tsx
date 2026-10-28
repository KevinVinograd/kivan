import { Button } from '@/app/components/components'
import type { TeamMember } from './clients-mock-data'

export type TeamBulkActionsProps = {
  /** The currently selected members; the bar hides itself when empty. */
  members: TeamMember[]
  onGenerateStatements: (members: TeamMember[]) => void
  onChangeStatus: (members: TeamMember[]) => void
  onExport: (members: TeamMember[]) => void
  /** Optional "Limpiar" affordance to clear the selection. */
  onClear?: () => void
}

/**
 * Selection bulk-action bar shared by the table toolbar and the master-detail
 * list, so the count + Generar cuentas / Cambiar estado / Exportar actions live
 * in one place instead of being duplicated per view. Renders nothing when the
 * selection is empty. Styled as a reverse (dark) bar with inverse controls.
 */
export function TeamBulkActions({
  members,
  onGenerateStatements,
  onChangeStatus,
  onExport,
  onClear,
}: TeamBulkActionsProps) {
  if (members.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-control bg-reverse px-3 py-2">
      <span className="type-caption fg-reverse-subtle">{members.length} seleccionados</span>
      {onClear ? (
        <Button variant="transparent" color="inverse" size="dense" onClick={onClear}>
          Limpiar
        </Button>
      ) : null}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <Button
          variant="outlined"
          color="inverse"
          size="dense"
          onClick={() => onGenerateStatements(members)}
        >
          Generar cuentas
        </Button>
        <Button
          variant="outlined"
          color="inverse"
          size="dense"
          onClick={() => onChangeStatus(members)}
        >
          Cambiar estado
        </Button>
        <Button variant="outlined" color="inverse" size="dense" onClick={() => onExport(members)}>
          Exportar
        </Button>
      </div>
    </div>
  )
}

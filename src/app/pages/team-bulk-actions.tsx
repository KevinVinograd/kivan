import { Button } from '@/app/components/components'
import type { TeamMember } from './clients-mock-data'

export type TeamBulkActionsProps = {
  members: TeamMember[]
  onGenerateStatements: (members: TeamMember[]) => void
  onChangeStatus: (members: TeamMember[]) => void
  onExport: (members: TeamMember[]) => void
  onClear?: () => void
}

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

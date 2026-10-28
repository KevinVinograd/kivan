import { Button, Skeleton } from '@/app/components/components'

/** Loading state (§14): toolbar skeleton + header + 8 skeleton rows. */
export function TeamLoading() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      {/* Mirrors `Toolbar`'s geometry (patterns/toolbar.tsx) and `TeamToolbar`'s actual
          slots — search + one filter + one columns menu. See the note in `clients-states`:
          modelling the toolbar's OLD hand-rolled shape here kept the two-row phone wrap
          alive in the loading state. */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-10 min-w-0 flex-1 sm:max-w-72" />
        <Skeleton className="size-10 shrink-0" />
        <div className="ml-auto flex shrink-0 gap-2">
          <Skeleton className="size-10" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-10 w-full" />
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    </div>
  )
}

function StateMessage({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string
  description: string
  actionLabel: string
  onAction: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 md:px-6 lg:px-8 desktop:px-10 py-16 text-center">
      <h2 className="type-heading fg-default">{title}</h2>
      <p className="max-w-md type-body-2 fg-subtle">{description}</p>
      <Button variant="solid" color="primary" onClick={onAction}>
        {actionLabel}
      </Button>
    </div>
  )
}

/** Empty state, no people loaded at all (§14). */
export function TeamEmptyGeneral({ onNewMember }: { onNewMember: () => void }) {
  return (
    <StateMessage
      title="Todavía no hay personas cargadas"
      description="Agregá miembros del equipo para empezar a registrar horas, asignaciones, pagos y productividad."
      actionLabel="Agregar persona"
      onAction={onNewMember}
    />
  )
}

/** Error state (§14). */
export function TeamError({ onRetry }: { onRetry: () => void }) {
  return (
    <StateMessage
      title="No pudimos cargar el equipo"
      description="Intentá nuevamente. Si el problema persiste, revisá la conexión."
      actionLabel="Reintentar"
      onAction={onRetry}
    />
  )
}

/** Empty state with active filters (§14), rendered inside the table body. */
export function TeamEmptyFiltered({ onClearFilters }: { onClearFilters: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <p className="type-body-2 fg-default">No encontramos personas</p>
      <p className="type-caption fg-subtle">Probá ajustar los filtros o buscar con otro término.</p>
      <Button variant="outlined" color="primary" size="dense" onClick={onClearFilters}>
        Limpiar filtros
      </Button>
    </div>
  )
}

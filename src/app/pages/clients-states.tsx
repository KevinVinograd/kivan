import { Button, Skeleton } from '@/app/components/components'

export function ClientsLoading() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
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
  action,
}: {
  title: string
  description: string
  action?: { label: string; onAction: () => void }
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 md:px-6 lg:px-8 desktop:px-10 py-16 text-center">
      <h2 className="type-heading fg-default">{title}</h2>
      <p className="max-w-md type-body-2 fg-subtle">{description}</p>
      {action ? (
        <Button variant="solid" color="primary" onClick={action.onAction}>
          {action.label}
        </Button>
      ) : null}
    </div>
  )
}

export function ClientsEmptyGeneral({ onNewClient }: { onNewClient: () => void }) {
  return (
    <StateMessage
      title="Todavía no hay clientes cargados"
      description="Creá tu primer cliente para empezar a registrar pagos, servicios, equipo asignado y facturación."
      action={{ label: 'Nuevo cliente', onAction: onNewClient }}
    />
  )
}

export function ClientsEmptyNoAssignments() {
  return (
    <StateMessage
      title="Todavía no tenés clientes asignados"
      description="Cuando te asignen una cuenta vas a verla acá, con su estado y el trabajo que registres."
    />
  )
}

export function ClientsError({ onRetry }: { onRetry: () => void }) {
  return (
    <StateMessage
      title="No pudimos cargar los clientes"
      description="Intentá nuevamente. Si el problema persiste, revisá la conexión."
      action={{ label: 'Reintentar', onAction: onRetry }}
    />
  )
}

export function ClientsEmptyFiltered({ onClearFilters }: { onClearFilters: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <p className="type-body-2 fg-default">No encontramos clientes</p>
      <p className="type-caption fg-subtle">
        Probá ajustar los filtros o buscar con otro término.
      </p>
      <Button variant="outlined" color="primary" size="dense" onClick={onClearFilters}>
        Limpiar filtros
      </Button>
    </div>
  )
}

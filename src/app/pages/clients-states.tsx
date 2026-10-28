import { Button, Skeleton } from '@/app/components/components'

/** Loading state (§10): toolbar skeleton + header + 8 skeleton rows. */
export function ClientsLoading() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      {/* Mirrors `Toolbar`'s geometry (patterns/toolbar.tsx) and `ClientsToolbar`'s actual
          slots — search + one filter + one columns menu. It used to model the toolbar's OLD
          hand-rolled shape (`flex-wrap` + a `w-full sm:w-72` search, plus four controls the
          real toolbar never had), so the two-row phone wrap this pattern was built to kill
          still shipped in the loading state and the row jumped when the data landed. A
          loading skeleton that does not match the thing it is standing in for is a lie the
          user sees. */}
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

/**
 * The action is optional: an empty state whose reader cannot act on it (the Equipo on an
 * empty roster — they may not create clients) renders the message alone. Offering a CTA
 * the API answers with a 403 is worse than offering none.
 */
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

/** Empty state, no clients loaded at all (§10). Manager roles only — creating a client is
 *  owner/admin (`requireRole('owner','admin')` on `POST /clients`). */
export function ClientsEmptyGeneral({ onNewClient }: { onNewClient: () => void }) {
  return (
    <StateMessage
      title="Todavía no hay clientes cargados"
      description="Creá tu primer cliente para empezar a registrar pagos, servicios, equipo asignado y facturación."
      action={{ label: 'Nuevo cliente', onAction: onNewClient }}
    />
  )
}

/**
 * The Equipo's empty roster (§10). Their view is scoped to the clients assigned to them,
 * so an empty list means "nothing assigned to you", not "no clients exist" — and the fix
 * is someone else assigning them, never a create button they are not allowed to press.
 */
export function ClientsEmptyNoAssignments() {
  return (
    <StateMessage
      title="Todavía no tenés clientes asignados"
      description="Cuando te asignen una cuenta vas a verla acá, con su estado y el trabajo que registres."
    />
  )
}

/** Error state (§10). */
export function ClientsError({ onRetry }: { onRetry: () => void }) {
  return (
    <StateMessage
      title="No pudimos cargar los clientes"
      description="Intentá nuevamente. Si el problema persiste, revisá la conexión."
      action={{ label: 'Reintentar', onAction: onRetry }}
    />
  )
}

/** Empty state with active filters (§10), rendered inside the table body. */
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

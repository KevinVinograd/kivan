import { Button, Skeleton } from '@/app/components/components'
import { KpiSummaryCardSkeleton } from '@/app/components/patterns'

export function CobranzaLoading({ storageKey }: { storageKey?: string }) {
  return (
    <div className="flex flex-col gap-4 md:gap-6" aria-hidden>
      <div className="px-4 md:px-6 lg:px-8 desktop:px-10">
        <KpiSummaryCardSkeleton heroCount={2} supportingCount={5} footer storageKey={storageKey} />
      </div>
      <div className="flex flex-col gap-2 px-4 md:px-6 lg:px-8 desktop:px-10">
        <div className="flex items-center gap-2">
          <Skeleton className="h-10 min-w-0 flex-1 sm:max-w-72" />
          <Skeleton className="size-10 shrink-0" />
        </div>
        <Skeleton className="h-10 w-full" />
        {Array.from({ length: 8 }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    </div>
  )
}

function StateMessage({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 md:px-6 lg:px-8 desktop:px-10 py-16 text-center">
      <h2 className="type-heading fg-default">{title}</h2>
      <p className="max-w-md type-body-2 fg-subtle">{description}</p>
    </div>
  )
}

export function CobranzaError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 md:px-6 lg:px-8 desktop:px-10 py-16 text-center">
      <h2 className="type-heading fg-default">No pudimos cargar la información de cobranza y pagos</h2>
      <p className="max-w-md type-body-2 fg-subtle">
        Intentá nuevamente. Si el problema persiste, revisá la conexión.
      </p>
      <Button variant="solid" color="primary" onClick={onRetry}>
        Reintentar
      </Button>
    </div>
  )
}

export function CobrosEmpty() {
  return (
    <StateMessage
      title="Todavía no hay cobros para este período"
      description="Cuando cierres la operación mensual o agregues clientes activos, vas a ver acá los cobros esperados del mes."
    />
  )
}

export function PagosEmpty() {
  return (
    <StateMessage
      title="Todavía no hay pagos para este período"
      description="Acá se registran los pagos a proveedores y otros egresos con Nuevo pago. Las liquidaciones del equipo están en Operación mensual, en Equipo y pagos."
    />
  )
}

export function CobranzaEmptyFiltered({ onClearFilters }: { onClearFilters: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <p className="type-body-2 fg-default">No encontramos resultados</p>
      <p className="type-caption fg-subtle">Probá ajustar los filtros o buscar con otro término.</p>
      <Button variant="outlined" color="primary" size="dense" onClick={onClearFilters}>
        Limpiar filtros
      </Button>
    </div>
  )
}

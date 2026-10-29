import { Button, Skeleton } from '@/app/components/components'

export function AccountLedgerLoading() {
  return (
    <div className="flex flex-col gap-2 px-4 md:px-6 lg:px-8 desktop:px-10" aria-hidden>
      <Skeleton className="h-10 w-full sm:max-w-72" />
      <Skeleton className="h-10 w-full" />
      {Array.from({ length: 8 }).map((_, index) => (
        <Skeleton key={index} className="h-12 w-full" />
      ))}
    </div>
  )
}

export function AccountLedgerError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 md:px-6 lg:px-8 desktop:px-10 py-16 text-center">
      <h2 className="type-heading fg-default">No pudimos cargar las cuentas corrientes</h2>
      <p className="max-w-md type-body-2 fg-subtle">
        Intentá nuevamente. Si el problema persiste, revisá la conexión.
      </p>
      <Button variant="solid" color="primary" onClick={onRetry}>
        Reintentar
      </Button>
    </div>
  )
}

export function AccountLedgerEmpty({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 md:px-6 lg:px-8 desktop:px-10 py-16 text-center">
      <h2 className="type-heading fg-default">Todavía no hay cuentas corrientes</h2>
      <p className="max-w-md type-body-2 fg-subtle">{label}</p>
    </div>
  )
}

export function AccountLedgerEmptyFiltered({ onClearFilters }: { onClearFilters: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <p className="type-body-2 fg-default">No encontramos resultados</p>
      <p className="type-caption fg-subtle">Probá ajustar la búsqueda o el término.</p>
      <Button variant="outlined" color="primary" size="dense" onClick={onClearFilters}>
        Limpiar búsqueda
      </Button>
    </div>
  )
}

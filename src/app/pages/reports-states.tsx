import { useNavigate } from 'react-router'

import { Button, Skeleton } from '@/app/components/components'

export function ReportsLoading() {
  return (
    <div className="flex flex-col gap-4 md:gap-6" aria-hidden>
      <div className="grid grid-cols-2 gap-6 px-4 md:px-6 lg:px-8 desktop:px-10 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-20 w-full" />
        ))}
      </div>
      <div className="flex flex-col gap-4 md:gap-6 px-4 md:px-6 lg:px-8 desktop:px-10">
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-10 w-full" />
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-12 w-full" />
        ))}
      </div>
    </div>
  )
}

export function ReportsError({
  onRetry,
  onResetPeriod,
}: {
  onRetry: () => void
  onResetPeriod: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 md:px-6 lg:px-8 desktop:px-10 py-16 text-center">
      <h2 className="type-heading fg-default">No pudimos cargar los reportes</h2>
      <p className="max-w-md type-body-2 fg-subtle">
        Hubo un problema al obtener la información del período seleccionado.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button variant="solid" color="primary" onClick={onRetry}>
          Reintentar
        </Button>
        <Button variant="outlined" color="primary" onClick={onResetPeriod}>
          Volver al período actual
        </Button>
      </div>
    </div>
  )
}

export function ReportsEmptyPeriod() {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 md:px-6 lg:px-8 desktop:px-10 py-16 text-center">
      <h2 className="type-heading fg-default">Todavía no hay datos para este período</h2>
      <p className="max-w-md type-body-2 fg-subtle">
        Cuando se carguen horas, cobros, pagos o producciones en Operación mensual, los reportes se van a
        generar automáticamente.
      </p>
      <Button variant="solid" color="primary" onClick={() => navigate('/operacion-mensual')}>
        Ir a operación mensual
      </Button>
    </div>
  )
}

export function ReportsNoResults({ onClearFilters }: { onClearFilters: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <p className="type-body-2 fg-default">No encontramos resultados con estos filtros</p>
      <p className="type-caption fg-subtle">Probá cambiando el período, cliente, persona o tipo de tarea.</p>
      <Button variant="outlined" color="primary" size="dense" onClick={onClearFilters}>
        Limpiar filtros
      </Button>
    </div>
  )
}

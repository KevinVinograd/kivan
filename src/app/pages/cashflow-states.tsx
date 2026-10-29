import { Button, Skeleton } from '@/app/components/components'

export function CashflowLoading() {
  return (
    <div className="flex flex-col gap-4 md:gap-6 px-4 md:px-6 lg:px-8 desktop:px-10" aria-hidden>
      <Skeleton className="h-10 w-64" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-72 w-full" />
    </div>
  )
}

export function CashflowError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 md:px-6 lg:px-8 desktop:px-10 py-16 text-center">
      <h2 className="type-heading fg-default">No pudimos cargar la tesorería</h2>
      <p className="max-w-md type-body-2 fg-subtle">
        No mostramos la proyección porque no tenemos los saldos reales. Intentá nuevamente.
      </p>
      <Button variant="solid" color="primary" onClick={onRetry}>
        Reintentar
      </Button>
    </div>
  )
}

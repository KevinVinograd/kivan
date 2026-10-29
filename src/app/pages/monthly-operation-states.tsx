import { Button, Skeleton } from '@/app/components/components'

export function MonthlyOperationLoading() {
  return (
    <div className="flex flex-col gap-4 md:gap-6 px-4 md:px-6 lg:px-8 desktop:px-10" aria-hidden>
      <Skeleton className="h-20 w-full" />
      <Skeleton className="h-40 w-full" />
      <Skeleton className="h-16 w-full" />
      <Skeleton className="h-16 w-full" />
    </div>
  )
}

export function MonthlyOperationError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 md:px-6 lg:px-8 desktop:px-10 py-16 text-center">
      <h2 className="type-heading fg-default">No pudimos cargar el mes</h2>
      <p className="max-w-md type-body-2 fg-subtle">
        No mostramos las cifras del período porque no pudimos traerlas. Intentá nuevamente.
      </p>
      <Button variant="solid" color="primary" onClick={onRetry}>
        Reintentar
      </Button>
    </div>
  )
}

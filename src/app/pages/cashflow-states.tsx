import { Button, Skeleton } from '@/app/components/components'

/** Loading state: the KPI strip + chart shape while the treasury store resolves. */
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

/**
 * Page-level error state with retry.
 *
 * `/cashflow` MUST render this instead of the projection when the treasury fetch fails.
 * The projection anchors its opening balance on the accounts array (`cashflow-page.tsx`
 * -> `laneAmount(saldosByLane(accounts), lane)`), so a failed fetch used to yield a
 * confident 13-week cash projection starting at $0 — and a cash-crunch alert derived from
 * it. A wrong money projection is worse than no projection: the owner would plan payroll
 * against a number the backend never returned.
 */
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

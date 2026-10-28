import { Button, Skeleton } from '@/app/components/components'
import { buildTrailHref } from '@/app/lib/nav-trail'
import { DashboardCta } from './dashboard-cta'

// The dashboard is the trail root, so the state CTAs carry a back-trail crumb to
// the dashboard (no inbound trail to forward — `new URLSearchParams()`).
const OPERATION_CTA_HREF = buildTrailHref(
  '/operacion-mensual',
  { label: 'Dashboard', to: '/dashboard' },
  new URLSearchParams(),
)

/** Loading state: the 4 KPI tiles over a couple of section blocks. Skeletons, not a spinner. */
export function AdminDashboardLoading() {
  return (
    <div className="flex flex-col gap-4 md:gap-6" aria-hidden>
      <div className="grid grid-cols-1 gap-4 px-4 md:px-6 lg:px-8 desktop:px-10 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28 w-full" />
        ))}
      </div>
      <div className="flex flex-col gap-4 md:gap-6 px-4 md:px-6 lg:px-8 desktop:px-10">
        <Skeleton className="h-6 w-56" />
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton key={index} className="h-20 w-full" />
        ))}
      </div>
    </div>
  )
}

/** Empty state when the selected month has no loaded operational data. */
export function AdminDashboardEmptyMonth() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 md:px-6 lg:px-8 desktop:px-10 py-16 text-center">
      <h2 className="type-heading fg-default">Todavía no hay datos cargados para este mes</h2>
      <p className="max-w-md type-body-2 fg-subtle">
        Cargá la operación mensual para ver pendientes, pagos, viáticos y facturación.
      </p>
      <DashboardCta href={OPERATION_CTA_HREF} variant="solid" size="default">
        Cargar operación mensual
      </DashboardCta>
    </div>
  )
}

/** Page-level error state with retry + a path into Operación mensual. */
export function AdminDashboardError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 md:px-6 lg:px-8 desktop:px-10 py-16 text-center">
      <h2 className="type-heading fg-default">No pudimos cargar el dashboard de operación</h2>
      <p className="max-w-md type-body-2 fg-subtle">
        Reintentá o entrá a Operación mensual para revisar los datos.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button variant="solid" color="primary" onClick={onRetry}>
          Reintentar
        </Button>
        <DashboardCta href={OPERATION_CTA_HREF} variant="outlined" size="default">
          Ir a operación mensual
        </DashboardCta>
      </div>
    </div>
  )
}

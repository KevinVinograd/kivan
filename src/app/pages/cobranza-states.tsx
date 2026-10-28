import { Button, Skeleton } from '@/app/components/components'
import { KpiSummaryCardSkeleton } from '@/app/components/patterns'

/** Loading state: a summary-card skeleton over a table skeleton. Shared by /billing,
 *  /cobros and /pagos — all three render ONE `KpiSummaryCard` holding a two-`type-metric`
 *  lane pair over a five-figure `type-metric-2` supporting grid (seven `Kpi`s), so the
 *  skeleton mirrors that shape rather than a flat tile strip and the card drops in
 *  without a layout shift.
 *
 *  The pair IS skeletoned now, and could not be before. The lanes used to live in a
 *  second card that rendered only when the period held non-peso money, so a placeholder
 *  for it would have been a guess about data that had not arrived — and on the months
 *  that held none, a card would have appeared and then vanished. The dollar figure is
 *  unconditional now, so drawing two bars is a fact rather than a guess.
 *
 *  `storageKey` is the SAME key that page's card passes, so a reader who collapsed the
 *  card gets the dense skeleton back — otherwise the tall comfortable skeleton would snap
 *  into a short dense card the instant the data lands. */
export function CobranzaLoading({ storageKey }: { storageKey?: string }) {
  return (
    <div className="flex flex-col gap-4 md:gap-6" aria-hidden>
      <div className="px-4 md:px-6 lg:px-8 desktop:px-10">
        {/* Two heroes, five supporting figures and a footer, because that is exactly what
            all three cards hold: the lane pair, then the rest, then the line saying the two
            totals do not add up. Every one of those is structural rather than
            data-dependent, so none of them is a guess. */}
        <KpiSummaryCardSkeleton heroCount={2} supportingCount={5} footer storageKey={storageKey} />
      </div>
      <div className="flex flex-col gap-2 px-4 md:px-6 lg:px-8 desktop:px-10">
        {/* Mirrors `Toolbar`'s geometry (patterns/toolbar.tsx): one row that never wraps, a
            search that flexes and caps at 288px, a filter that holds its size. See the note
            in `clients-states` — the old shape kept the two-row phone wrap alive here. */}
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

/** Page-level error state (§20) with retry. */
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

/** Empty state, no cobros for the period (§18.1). Actions are deferred until the
 *  manual-cobro flow lands, so the state is informational only. */
export function CobrosEmpty() {
  return (
    <StateMessage
      title="Todavía no hay cobros para este período"
      description="Cuando cierres la operación mensual o agregues clientes activos, vas a ver acá los cobros esperados del mes."
    />
  )
}

/** Empty state, no pagos for the period (§18.2). */
export function PagosEmpty() {
  return (
    <StateMessage
      title="Todavía no hay pagos para este período"
      description="Acá se registran los pagos a proveedores y otros egresos con Nuevo pago. Las liquidaciones del equipo están en Operación mensual, en Equipo y pagos."
    />
  )
}

/** Empty state with active filters (§18), rendered inside the table body. */
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

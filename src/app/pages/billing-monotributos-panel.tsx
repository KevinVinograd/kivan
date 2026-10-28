import { Badge, Button, Card, CardContent } from '@/app/components/components'
import { SectionHeader } from '@/app/components/templates'
import { ArcGauge } from '@/app/components/patterns'
import { EMITTER_ALERT_BADGE, type EmitterAlertLevel } from './cobros-invoice'
import { useInvoiceEmitters, type RealEmitter } from './emitters-api-data'

/** Alert level → data-viz gauge token (the value arc color). */
const EMITTER_GAUGE_FG: Record<EmitterAlertLevel, string> = {
  disponible: 'fg-data-green',
  cerca_limite: 'fg-data-yellow',
  limite_alcanzado: 'fg-data-red',
  error_conexion: 'fg-data-red',
  datos_incompletos: 'fg-data-yellow',
}

/**
 * Monotributos panel — the three emisores (§9.5) the agency invoices from, each as
 * a compact usage gauge (`ArcGauge`) in a single row, with its monthly-usage
 * percentage and ARCA alert badge. Read-only context at the top of the Facturación
 * page; the per-cobro emisor selection happens inside the Generar factura dialog.
 *
 * Read from the workspace's real emisores (`GET /invoice-emitters`). It used to render a
 * hardcoded sample (three made-up monotributos, one "Límite alcanzado") on every workspace,
 * including ones with none loaded: a fake fiscal ceiling on the page people invoice from.
 * Found on the 25/10 review.
 */
export function BillingMonotributosPanel() {
  const { emitters, isLoading, isError, refetch } = useInvoiceEmitters()
  return (
    <section aria-label="Monotributos" className="flex flex-col px-4 md:px-6 lg:px-8 desktop:px-10">
      <SectionHeader title="Monotributos" inset={false} />
      <Card>
        {isLoading ? (
          <CardContent>
            <p className="type-body-2 fg-subtle">Cargando monotributos…</p>
          </CardContent>
        ) : isError ? (
          <CardContent className="flex flex-wrap items-center gap-3">
            <p className="type-body-2 fg-subtle">No pudimos cargar los monotributos.</p>
            <Button variant="outlined" color="primary" size="dense" onClick={refetch}>
              Reintentar
            </Button>
          </CardContent>
        ) : emitters.length === 0 ? (
          <CardContent>
            <p className="type-body-2 fg-subtle">Sin monotributos cargados.</p>
          </CardContent>
        ) : (
        <CardContent className="grid grid-cols-3 gap-2">
          {emitters.map((emitter) => {
            const pct = usagePct(emitter)
            const badge = EMITTER_ALERT_BADGE[emitter.alert]
            return (
              <div key={emitter.id} className="flex flex-col items-center gap-1.5">
                <ArcGauge
                  percent={pct}
                  valueClassName={EMITTER_GAUGE_FG[emitter.alert]}
                  ariaLabel={`${emitter.label}: uso ${pct}%`}
                  label={emitter.label}
                  className="w-full max-w-[150px]"
                />
                <Badge variant={badge.variant}>{badge.label}</Badge>
              </div>
            )
          })}
        </CardContent>
        )}
      </Card>
    </section>
  )
}

/** Monthly usage as a whole percent; an emisor with no ceiling reads 0, never "full". */
function usagePct(emitter: RealEmitter): number {
  if (emitter.monthlyLimit <= 0) return 0
  return Math.min(100, Math.round((emitter.monthlyUsed / emitter.monthlyLimit) * 100))
}

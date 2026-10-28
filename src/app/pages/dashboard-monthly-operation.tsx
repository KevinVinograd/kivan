import { buildTrailHref } from '@/app/lib/nav-trail'
import { SectionHeader } from '@/app/components/templates'
import { Progress } from '@/app/components/components'
import { KpiSummaryCard, type Kpi } from '@/app/components/patterns'
import { DashboardCta } from './dashboard-cta'
import { formatPercent } from './dashboard-format'
import { DASHBOARD_CRUMB } from './dashboard-trail'
import type { OperationStatus } from './dashboard-types'

// The dashboard is the trail root, so these CTAs carry a back-trail crumb to the
// dashboard (no inbound trail to forward — `new URLSearchParams()`).
const OPERATION_CTA_HREF = buildTrailHref('/operacion-mensual', DASHBOARD_CRUMB, new URLSearchParams())
const OPERATION_ESTADO_CTA_HREF = buildTrailHref(
  '/operacion-mensual?block=estado',
  DASHBOARD_CRUMB,
  new URLSearchParams(),
)

/**
 * §4 Operación mensual. A single large card summarizing close readiness for the
 * month: a completion bar plus the per-area load lines (cobros, pagos, horas,
 * viáticos, extras, facturación). It only reports status and routes into the
 * real workflow; it does not duplicate the Operación mensual page.
 */
export function MonthlyOperationStatusCard({ operation }: { operation: OperationStatus }) {
  const tone =
    operation.completion >= 100 ? 'success' : operation.completion < 50 ? 'warning' : 'default'

  // §6 focal → the completion percentage: the one number that answers "can we close the
  // month". It is toned because the FIGURE ITSELF is the status, and it carries no caption
  // (the section header already names it), with the pending-items count as its hint. The
  // per-area load lines follow as the supporting tier, each keeping the tone the selector
  // assigned it — including `Facturación revisada`'s prose "Pendiente", which the card
  // steps down to `type-section` on its own while KEEPING the warning tint.
  const figures: Kpi[] = [
    {
      id: 'completion',
      label: '',
      value: formatPercent(operation.completion),
      tone,
      hint: `${operation.pendingItems} datos pendientes`,
    },
    ...operation.lines.map((line) => ({
      id: line.id,
      label: line.label,
      value: line.value,
      tone: line.tone,
    })),
  ]

  return (
    <section aria-label="Operación mensual" className="flex flex-col">
      <SectionHeader title="Operación mensual" description="Estado de carga y cierre del mes actual." />
      <div className="px-4 md:px-6 lg:px-8 xl:pr-5 desktop:pl-10">
        <KpiSummaryCard
          figures={figures}
          heroId="completion"
          footer={
            <Progress value={operation.completion} tone={tone} aria-label="Avance de la operación mensual" />
          }
          actions={
            <>
              <DashboardCta href={OPERATION_CTA_HREF} variant="solid">
                Continuar operación mensual
              </DashboardCta>
              <DashboardCta href={OPERATION_ESTADO_CTA_HREF}>Ver pendientes</DashboardCta>
            </>
          }
        />
      </div>
    </section>
  )
}

import { buildTrailHref } from '@/app/lib/nav-trail'
import { SectionHeader } from '@/app/components/templates'
import { Progress } from '@/app/components/components'
import { KpiSummaryCard, type Kpi } from '@/app/components/patterns'
import { DashboardCta } from './dashboard-cta'
import { formatPercent } from './dashboard-format'
import { DASHBOARD_CRUMB } from './dashboard-trail'
import type { OperationStatus } from './dashboard-types'

const OPERATION_CTA_HREF = buildTrailHref('/operacion-mensual', DASHBOARD_CRUMB, new URLSearchParams())
const OPERATION_ESTADO_CTA_HREF = buildTrailHref(
  '/operacion-mensual?block=estado',
  DASHBOARD_CRUMB,
  new URLSearchParams(),
)

export function MonthlyOperationStatusCard({ operation }: { operation: OperationStatus }) {
  const tone =
    operation.completion >= 100 ? 'success' : operation.completion < 50 ? 'warning' : 'default'

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

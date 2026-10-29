import { useNavigate } from 'react-router'

import { SectionHeader } from '@/app/components/templates'
import { Badge, Card, CardContent } from '@/app/components/components'
import { KpiSummaryCard } from '@/app/components/patterns'
import { FloatingCardCta } from './dashboard-cta'
import { formatHours, hoursStatusBadge } from './employee-dashboard-format'
import { SELF_CARGA_HREF } from './employee-dashboard-nav'
import type { ClientHours, HoursSummary } from './employee-dashboard-types'

function ClientHoursBreakdownCard({ row }: { row: ClientHours }) {
  const navigate = useNavigate()
  const status = hoursStatusBadge(row.status)
  return (
    <Card interactive onClick={() => navigate(SELF_CARGA_HREF)} className="group relative overflow-hidden">
      <CardContent className="flex items-center gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="type-section fg-default">{row.client}</span>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
          <span className="type-mono-2 tabular-nums fg-default">
            {formatHours(row.loaded)} cargadas
            {row.expected != null ? ` de ${formatHours(row.expected)}` : ''}
          </span>
        </div>
        <FloatingCardCta href={SELF_CARGA_HREF}>Cargar horas</FloatingCardCta>
      </CardContent>
    </Card>
  )
}

export function EmployeeHoursSnapshot({ hours }: { hours: HoursSummary }) {
  return (
    <section aria-label="Horas cargadas" className="flex flex-col">
      <SectionHeader
        title="Horas cargadas"
        description="Mantené tu carga de horas al día por cliente."
      />
      <div className="flex flex-col gap-4 md:gap-6 px-4 md:px-6 lg:pl-8 lg:pr-5 desktop:pl-10">
        <KpiSummaryCard
          figures={[
            { id: 'this-month', label: 'Este mes', value: formatHours(hours.loadedThisMonth) },
            { id: 'this-week', label: 'Esta semana', value: formatHours(hours.loadedThisWeek) },
            {
              id: 'expected',
              label: 'Esperadas',
              value:
                hours.expectedThisMonth != null ? formatHours(hours.expectedThisMonth) : 'No disponible',
            },
            { id: 'missing', label: 'Pendientes', value: formatHours(hours.missingHours) },
          ]}
          heroId="this-month"
        />

        {hours.clientsWithoutHoursThisWeek > 0 ? (
          <p className="type-caption fg-subtle">
            {hours.clientsWithoutHoursThisWeek}{' '}
            {hours.clientsWithoutHoursThisWeek === 1
              ? 'cliente sin horas esta semana'
              : 'clientes sin horas esta semana'}
          </p>
        ) : null}

        {hours.breakdown.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {hours.breakdown.map((row) => (
              <ClientHoursBreakdownCard key={row.clientId} row={row} />
            ))}
          </div>
        ) : (
          <p className="type-body-2 fg-subtle">No hay horas cargadas para este mes.</p>
        )}
      </div>
    </section>
  )
}

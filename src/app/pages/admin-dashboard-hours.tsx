import { useNavigate } from 'react-router'

import { SectionHeader } from '@/app/components/templates'
import { Avatar, AvatarFallback, Badge, Card, CardContent, Progress } from '@/app/components/components'
import { KpiSummaryCard } from '@/app/components/patterns'
import { buildTrailHref } from '@/app/lib/nav-trail'
import { DashboardCta, FloatingCardCta } from './dashboard-cta'
import { initials } from './clients-format'
import { formatHours, formatPercent, hoursStatusBadge } from './admin-dashboard-format'
import type { HoursCompleteness, HoursPersonRow } from './admin-dashboard-types'

const HOURS_CTA_HREF = buildTrailHref(
  '/operacion-mensual?block=estado',
  { label: 'Dashboard', to: '/dashboard' },
  new URLSearchParams(),
)

function completionTone(pct: number): 'default' | 'success' | 'warning' {
  if (pct >= 90) return 'success'
  if (pct >= 70) return 'default'
  return 'warning'
}

function PersonCard({ row }: { row: HoursPersonRow }) {
  const navigate = useNavigate()
  const status = hoursStatusBadge(row.status)
  return (
    <Card interactive onClick={() => navigate(row.ctaHref)} className="group relative overflow-hidden">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <Avatar>
                <AvatarFallback>{initials(row.personName)}</AvatarFallback>
              </Avatar>
              <span className="type-section fg-default">{row.personName}</span>
              <Badge variant={status.variant}>{status.label}</Badge>
            </div>
            <span className="type-caption fg-subtle">
              {row.clients.length > 0 ? row.clients.join(', ') : 'Sin clientes asignados'}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span className="type-mono-2 tabular-nums fg-default">
            Horas: {formatHours(row.loaded)} / {formatHours(row.expected)}
          </span>
          {row.missing > 0 ? (
            <span className="type-mono-2 tabular-nums fg-warning">Faltan {formatHours(row.missing)}</span>
          ) : null}
        </div>
        <FloatingCardCta href={row.ctaHref}>Ver horas</FloatingCardCta>
      </CardContent>
    </Card>
  )
}

export function HoursCompletenessCard({ hours }: { hours: HoursCompleteness | null }) {
  return (
    <section aria-label="Horas y productividad" className="group/horas flex flex-col">
      <SectionHeader
        title="Horas y productividad"
        actions={
          hours ? (
            <span className="[@media(hover:hover)]:opacity-0 motion-standard group-hover/horas:opacity-100 focus-within:opacity-100">
              <DashboardCta href={HOURS_CTA_HREF}>
                <span className="sm:hidden">Ver horas</span>
                <span className="hidden sm:block">Ver horas cargadas</span>
              </DashboardCta>
            </span>
          ) : undefined
        }
      />
      <div className="flex flex-col gap-4 md:gap-6 px-4 md:px-6 lg:px-8 xl:pr-5 desktop:pl-10">
        {hours ? (
          <>
            <KpiSummaryCard
              figures={[
                {
                  id: 'completion',
                  label: 'Carga completa',
                  value: formatPercent(hours.completionPercent),
                  tone: completionTone(hours.completionPercent),
                },
                {
                  id: 'expected-hours',
                  label: 'Horas esperadas',
                  value: formatHours(hours.expectedHours),
                },
                {
                  id: 'loaded-hours',
                  label: 'Horas cargadas',
                  value: formatHours(hours.loadedHours),
                },
                {
                  id: 'people-missing',
                  label: 'Personas con horas faltantes',
                  value: String(hours.peopleMissing),
                  tone: hours.peopleMissing > 0 ? 'warning' : 'default',
                },
                {
                  id: 'clients-incomplete',
                  label: 'Clientes con horas incompletas',
                  value: String(hours.clientsIncomplete),
                },
              ]}
              heroId="completion"
              footer={
                <Progress value={hours.completionPercent} tone={completionTone(hours.completionPercent)} />
              }
            />
            {hours.rows.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {hours.rows.map((row) => (
                  <PersonCard key={row.personId} row={row} />
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <div className="flex flex-col gap-1">
            <p className="type-body-2 fg-subtle">No disponible</p>
            <p className="type-caption fg-subtle">Faltan datos de horas para calcular la carga de este mes.</p>
          </div>
        )}
      </div>
    </section>
  )
}

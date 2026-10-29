import { useNavigate } from 'react-router'

import { SectionHeader } from '@/app/components/templates'
import { Badge, Card, CardContent } from '@/app/components/components'
import { FloatingCardCta } from './dashboard-cta'
import { alertSeverityBadge } from './dashboard-format'
import type { DashboardAlert } from './dashboard-types'

function DashboardAlertCard({ alert }: { alert: DashboardAlert }) {
  const navigate = useNavigate()
  const severity = alertSeverityBadge(alert.severity)
  return (
    <Card interactive onClick={() => navigate(alert.ctaHref)} className="group relative overflow-hidden">
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-start gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={severity.variant} highContrast={severity.highContrast}>{severity.label}</Badge>
            <span className="type-section fg-default">{alert.title}</span>
          </div>
        </div>
        <p className="type-body-2 fg-subtle">{alert.description}</p>
        <FloatingCardCta href={alert.ctaHref}>{alert.ctaLabel}</FloatingCardCta>
      </CardContent>
    </Card>
  )
}

export function CriticalAlertsList({ alerts }: { alerts: DashboardAlert[] }) {
  return (
    <section aria-label="Alertas críticas" className="flex flex-col">
      <SectionHeader title="Alertas críticas" />
      <div className="px-4 md:px-6 lg:px-8 xl:pr-5 desktop:pl-10">
        {alerts.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {alerts.map((alert) => (
              <DashboardAlertCard key={alert.id} alert={alert} />
            ))}
          </div>
        ) : (
          <p className="type-body-2 fg-subtle">No hay alertas críticas para este mes.</p>
        )}
      </div>
    </section>
  )
}

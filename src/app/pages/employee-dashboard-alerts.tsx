import { useNavigate } from 'react-router'

import { SectionHeader } from '@/app/components/templates'
import { Badge, Card, CardContent } from '@/app/components/components'
import { FloatingCardCta } from './dashboard-cta'
import { alertToneVariant } from './employee-dashboard-format'
import type { EmployeeAlert } from './employee-dashboard-types'

function EmployeeAlertCard({ alert }: { alert: EmployeeAlert }) {
  const navigate = useNavigate()
  return (
    <Card interactive onClick={() => navigate(alert.cta.href)} className="group relative overflow-hidden">
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-start gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={alertToneVariant(alert.tone)}>{alert.tag}</Badge>
            <span className="type-section fg-default">{alert.title}</span>
          </div>
        </div>
        <p className="type-body-2 fg-subtle">{alert.description}</p>
        <FloatingCardCta href={alert.cta.href}>{alert.cta.label}</FloatingCardCta>
      </CardContent>
    </Card>
  )
}

export function EmployeeClientAlerts({ alerts }: { alerts: EmployeeAlert[] }) {
  return (
    <section aria-label="Alertas de mis clientes" className="flex flex-col">
      <SectionHeader
        title="Alertas de mis clientes"
        description="Avisos operativos de tus clientes asignados."
      />
      <div className="px-4 md:px-6 lg:pl-8 lg:pr-5 desktop:pl-10">
        {alerts.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {alerts.map((alert) => (
              <EmployeeAlertCard key={alert.id} alert={alert} />
            ))}
          </div>
        ) : (
          <p className="type-body-2 fg-subtle">No hay alertas para tus clientes asignados.</p>
        )}
      </div>
    </section>
  )
}

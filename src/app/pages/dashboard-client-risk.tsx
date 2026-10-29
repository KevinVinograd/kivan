import { useNavigate } from 'react-router'

import { SectionHeader } from '@/app/components/templates'
import { Badge, Card, CardContent } from '@/app/components/components'
import { buildTrailHref } from '@/app/lib/nav-trail'
import { FloatingCardCta } from './dashboard-cta'
import { riskLevelBadge } from './dashboard-format'
import type { ClientRisk } from './dashboard-types'

function ClientRiskCard({ risk }: { risk: ClientRisk }) {
  const navigate = useNavigate()
  const level = riskLevelBadge(risk.level)
  const href = buildTrailHref(
    `/clients?risk=${risk.level}&open=${risk.clientId}`,
    { label: 'Dashboard', to: '/dashboard' },
    new URLSearchParams(),
  )
  return (
    <Card interactive onClick={() => navigate(href)} className="group relative overflow-hidden">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="type-section fg-default">{risk.clientName}</span>
            <Badge variant={level.variant} highContrast={level.highContrast}>{level.label}</Badge>
          </div>
        </div>

        {risk.reasons.length > 0 ? (
          <ul className="flex min-w-0 flex-wrap gap-2">
            {risk.reasons.map((reason) => (
              <li key={reason} className="flex min-w-0">
                <Badge variant="neutral" shape="pill" truncate>
                  {reason}
                </Badge>
              </li>
            ))}
          </ul>
        ) : null}
        <FloatingCardCta href={href}>Ver cliente</FloatingCardCta>
      </CardContent>
    </Card>
  )
}

export function ClientRiskList({ risks }: { risks: ClientRisk[] }) {
  return (
    <section aria-label="Clientes en riesgo" className="flex flex-col">
      <SectionHeader
        title="Clientes en riesgo"
        description="Señales que pueden anticipar pérdida de clientes, problemas de margen o falta de seguimiento."
      />
      <div className="px-4 md:px-6 lg:px-8 xl:pr-5 desktop:pl-10">
        {risks.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {risks.map((risk) => (
              <ClientRiskCard key={risk.clientId} risk={risk} />
            ))}
          </div>
        ) : (
          <p className="type-body-2 fg-subtle">No hay clientes en riesgo para este mes.</p>
        )}
      </div>
    </section>
  )
}

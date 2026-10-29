import { useNavigate } from 'react-router'

import { SectionHeader } from '@/app/components/templates'
import { Badge, Card, CardContent } from '@/app/components/components'
import { FloatingCardCta } from './dashboard-cta'
import { PENDING_TYPE_LABEL, severityBadge } from './admin-dashboard-format'
import type { OperationPending } from './admin-dashboard-types'

function OperationPendingItem({ item }: { item: OperationPending }) {
  const navigate = useNavigate()
  const severity = severityBadge(item.severity)
  return (
    <Card interactive onClick={() => navigate(item.ctaHref)} className="group relative overflow-hidden">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="type-section fg-default">{item.title}</span>
            <Badge variant={severity.variant}>{severity.label}</Badge>
            <Badge variant="outline">{PENDING_TYPE_LABEL[item.type]}</Badge>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="type-body-2 fg-subtle">{item.description}</span>
          {item.responsible ? (
            <span className="type-caption fg-subtle">Responsable: {item.responsible}</span>
          ) : null}
        </div>
        <FloatingCardCta href={item.ctaHref}>{item.ctaLabel}</FloatingCardCta>
      </CardContent>
    </Card>
  )
}

export function CriticalOperationsList({ pendings }: { pendings: OperationPending[] }) {
  return (
    <section aria-label="Pendientes críticos" className="flex flex-col">
      <SectionHeader
        title="Pendientes críticos"
        description="Datos o validaciones que pueden bloquear pagos, facturación o cierre mensual."
      />
      <div className="px-4 md:px-6 lg:px-8 xl:pr-5 desktop:pl-10">
        {pendings.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pendings.map((item) => (
              <OperationPendingItem key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <p className="type-body-2 fg-subtle">No hay pendientes críticos para este mes.</p>
        )}
      </div>
    </section>
  )
}

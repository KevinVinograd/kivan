import { useNavigate } from 'react-router'

import { SectionHeader } from '@/app/components/templates'
import { Badge, Card, CardContent } from '@/app/components/components'
import { FloatingCardCta } from './dashboard-cta'
import { pendingStatusBadge, pendingTypeLabel } from './employee-dashboard-format'
import type { PendingItem } from './employee-dashboard-types'

function EmployeePendingItem({ item }: { item: PendingItem }) {
  const navigate = useNavigate()
  const status = pendingStatusBadge(item.status)
  return (
    <Card interactive onClick={() => navigate(item.cta.href)} className="group relative overflow-hidden">
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-start gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="type-section fg-default">{item.title}</span>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 type-caption fg-subtle">
          <Badge variant="neutral" shape="pill">
            {pendingTypeLabel(item.type)}
          </Badge>
          <span>{item.client}</span>
          <span>Vence: {item.due}</span>
        </div>
        <p className="type-body-2 fg-subtle">{item.description}</p>
        <FloatingCardCta href={item.cta.href}>{item.cta.label}</FloatingCardCta>
      </CardContent>
    </Card>
  )
}

export function EmployeePendingList({ pending }: { pending: PendingItem[] }) {
  return (
    <section aria-label="Mis pendientes" className="flex flex-col">
      <SectionHeader
        title="Mis pendientes"
        description="Tareas y cargas que necesitan tu atención."
      />
      <div className="px-4 md:px-6 lg:pl-8 lg:pr-5 desktop:pl-10">
        {pending.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pending.map((item) => (
              <EmployeePendingItem key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <p className="type-body-2 fg-subtle">No tenés pendientes para este mes.</p>
        )}
      </div>
    </section>
  )
}

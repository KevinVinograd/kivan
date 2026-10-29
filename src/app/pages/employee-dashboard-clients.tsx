import { useNavigate } from 'react-router'

import { SectionHeader } from '@/app/components/templates'
import { Badge, Card, CardContent } from '@/app/components/components'
import { FloatingCardCta } from './dashboard-cta'
import { clientStatusBadge, formatHours, formatRelativeDate } from './employee-dashboard-format'
import { clientHref } from './employee-dashboard-nav'
import type { AssignedClient } from './employee-dashboard-types'

function AssignedClientCard({ client }: { client: AssignedClient }) {
  const navigate = useNavigate()
  const status = clientStatusBadge(client.status)
  const href = clientHref(client.clientId)
  return (
    <Card interactive onClick={() => navigate(href)} className="group relative overflow-hidden">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="type-section fg-default">{client.name}</span>
              <Badge variant={status.variant}>{status.label}</Badge>
            </div>
            <span className="type-body-2 fg-subtle">
              {client.role} · {client.services}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1 type-caption fg-subtle">
          <span>
            Objetivos: {client.objectivesDone} de {client.objectivesTotal}
          </span>
          <span>Horas: {formatHours(client.hoursLoaded)} cargadas</span>
          <span>
            Pendientes: {client.pendingTasks} {client.pendingTasks === 1 ? 'tarea' : 'tareas'}
          </span>
          <span>Última reunión: {formatRelativeDate(client.lastFeedbackIso)}</span>
        </div>
        <FloatingCardCta href={href}>Ver cliente</FloatingCardCta>
      </CardContent>
    </Card>
  )
}

export function AssignedClientsSnapshot({ clients }: { clients: AssignedClient[] }) {
  return (
    <section aria-label="Mis clientes" className="flex flex-col">
      <SectionHeader title="Mis clientes" description="Tus clientes asignados y su estado del mes." />
      <div className="px-4 md:px-6 lg:pl-8 lg:pr-5 desktop:pl-10">
        {clients.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {clients.map((client) => (
              <AssignedClientCard key={client.clientId} client={client} />
            ))}
          </div>
        ) : (
          <p className="type-body-2 fg-subtle">No tenés clientes asignados para este mes.</p>
        )}
      </div>
    </section>
  )
}

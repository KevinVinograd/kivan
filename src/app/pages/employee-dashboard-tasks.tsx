import { useNavigate } from 'react-router'

import { SectionHeader } from '@/app/components/templates'
import { Badge, Card, CardContent } from '@/app/components/components'
import { FloatingCardCta } from './dashboard-cta'
import { taskKindLabel, taskStatusBadge } from './employee-dashboard-format'
import type { TaskItem, TasksSummary } from './employee-dashboard-types'

function EmployeeTaskCard({ item }: { item: TaskItem }) {
  const navigate = useNavigate()
  const status = taskStatusBadge(item.status)
  return (
    <Card interactive onClick={() => navigate(item.cta.href)} className="group relative overflow-hidden">
      <CardContent className="flex items-start gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="type-section fg-default">{item.title}</span>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
          <span className="type-body-2 fg-default">{item.client}</span>
          <div className="flex flex-wrap items-center gap-2 type-caption fg-subtle">
            <Badge variant="neutral" shape="pill">
              {taskKindLabel(item.kind)}
            </Badge>
            <span>Fecha: {item.date}</span>
          </div>
        </div>
        <FloatingCardCta href={item.cta.href}>{item.cta.label}</FloatingCardCta>
      </CardContent>
    </Card>
  )
}

/**
 * §6 Producciones y tareas. Work tied to content productions, deliverables and
 * operational tasks: assigned/pending/due/overdue metrics plus the item list.
 */
export function EmployeeTasksSnapshot({ tasks }: { tasks: TasksSummary }) {
  return (
    <section aria-label="Producciones y tareas" className="flex flex-col">
      <SectionHeader
        title="Producciones y tareas"
        metadata={
          tasks.items.length > 0 ? (
            <>
              <span>{tasks.assigned} asignadas</span>
              <span>{tasks.pending} pendientes</span>
              <span>{tasks.dueThisWeek} esta semana</span>
              <span>{tasks.overdue} vencidas</span>
            </>
          ) : undefined
        }
      />
      <div className="px-4 md:px-6 lg:pl-8 lg:pr-5 desktop:pl-10">
        {tasks.items.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tasks.items.map((item) => (
              <EmployeeTaskCard key={item.id} item={item} />
            ))}
          </div>
        ) : (
          <p className="type-body-2 fg-subtle">No tenés producciones ni tareas para este mes.</p>
        )}
      </div>
    </section>
  )
}

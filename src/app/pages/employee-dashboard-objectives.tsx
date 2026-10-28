import { useNavigate } from 'react-router'

import { SectionHeader } from '@/app/components/templates'
import { Badge, Card, CardContent, Progress } from '@/app/components/components'
import { FloatingCardCta } from './dashboard-cta'
import { formatPercent, objectiveProgressTone, objectiveStatusBadge } from './employee-dashboard-format'
import { clientHref } from './employee-dashboard-nav'
import type { Objective } from './employee-dashboard-types'

function ObjectiveItem({ objective }: { objective: Objective }) {
  const navigate = useNavigate()
  const status = objectiveStatusBadge(objective.status)
  // Objectives are always tied to a client, so the whole card navigates there.
  const href = clientHref(objective.clientId)
  return (
    <Card interactive onClick={() => navigate(href)} className="group relative overflow-hidden">
      <CardContent className="flex flex-col gap-2">
        <div className="flex items-start gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="type-section fg-default">{objective.title}</span>
              <Badge variant={status.variant}>{status.label}</Badge>
            </div>
            <span className="type-caption fg-subtle">
              {objective.client} · Vence: {objective.due}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Progress
            value={objective.progress}
            tone={objectiveProgressTone(objective.status)}
            className="flex-1"
          />
          <span className="type-mono-2 tabular-nums fg-default">{formatPercent(objective.progress)}</span>
        </div>
        <FloatingCardCta href={href}>Ver cliente</FloatingCardCta>
      </CardContent>
    </Card>
  )
}

/**
 * §4 Objetivos del mes. A dashboard snapshot (not a project manager) of the
 * employee's client-tied goals: totals plus a progress + status row per objective.
 */
export function MonthlyObjectivesSnapshot({ objectives }: { objectives: Objective[] }) {
  const completed = objectives.filter((objective) => objective.status === 'completado').length
  const atRisk = objectives.filter((objective) => objective.status === 'en_riesgo').length
  const overdue = objectives.filter((objective) => objective.status === 'vencido').length

  return (
    <section aria-label="Objetivos del mes" className="flex flex-col">
      <SectionHeader
        title="Objetivos del mes"
        metadata={
          objectives.length > 0 ? (
            <>
              <span>{objectives.length} objetivos</span>
              <span>{completed} cumplidos</span>
              <span>{atRisk} en riesgo</span>
              <span>{overdue} vencidos</span>
            </>
          ) : undefined
        }
      />
      <div className="px-4 md:px-6 lg:pl-8 lg:pr-5 desktop:pl-10">
        {objectives.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {objectives.map((objective) => (
              <ObjectiveItem key={objective.id} objective={objective} />
            ))}
          </div>
        ) : (
          <p className="type-body-2 fg-subtle">No tenés objetivos para este mes.</p>
        )}
      </div>
    </section>
  )
}

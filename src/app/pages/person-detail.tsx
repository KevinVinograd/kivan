import { useNavigate } from 'react-router'

import { Badge, Button, Card, CardContent } from '@/app/components/components'
import { buildTrailHref } from '@/app/lib/nav-trail'
import { hasCapability } from '@hold/shared'
import { useRole } from '@/app/lib/use-role'
import { CARGA_CRUMB } from './reports-trail'
import {
  ReportComparisonSection,
  ReportDetailRow,
  ReportDetailSection,
  ReportDetailShell,
  ReportFiguresCard,
} from './reports-detail-ui'
import { COHORT_WINDOW, DistributionDonut, HoursBarChart, TrendLineChart } from './reports-charts'
import { cohortRanking, hoursByClient, hoursByTask, median } from './reports-aggregations'
import { useReportsHoursHistory } from './reports-api-data'
import {
  capacityStatusBadge,
  formatCurrency,
  formatHours,
  formatPercent,
  utilizationTone,
} from './reports-format'
import type { ProductivityReportItem, TeamCapacityReportItem } from './reports-types'

function formatPoints(value: number): string {
  const rounded = Math.round(value)
  const sign = rounded > 0 ? '+' : ''
  return `${sign}${rounded} pp`
}

function teamTaskShare(allProductivity: ProductivityReportItem[]): Map<string, number> {
  const byTask = hoursByTask(allProductivity)
  const total = byTask.reduce((sum, datum) => sum + datum.value, 0)
  const share = new Map<string, number>()
  if (total === 0) return share
  for (const datum of byTask) share.set(datum.id, (datum.value / total) * 100)
  return share
}

export function PersonDetail({
  item,
  cohort,
  productivity,
  allProductivity,
  onClose,
}: {
  item: TeamCapacityReportItem | null
  cohort: TeamCapacityReportItem[]
  productivity: ProductivityReportItem[]
  allProductivity: ProductivityReportItem[]
  onClose: () => void
}) {
  const navigate = useNavigate()
  const { capabilities } = useRole()
  const historyQuery = useReportsHoursHistory(item?.personId ?? '', item != null)
  if (!item) return null

  const showMoney = hasCapability(capabilities, 'teamCost')
  const badge = capacityStatusBadge(item.status)

  const byClient = hoursByClient(productivity)
  const byTask = hoursByTask(productivity)
  const personHours = productivity.reduce((sum, row) => sum + row.hours, 0)
  const extras = productivity.filter((row) => row.isExtra)
  const extraHours = extras.reduce((sum, row) => sum + row.hours, 0)
  const extraShare = personHours > 0 ? (extraHours / personHours) * 100 : 0
  const history = historyQuery.isError ? [] : historyQuery.data

  const ranking = cohortRanking(
    cohort
      .filter((person) => person.utilization != null)
      .map((person) => ({
        id: person.personId,
        label: person.personName,
        value: (person.utilization ?? 0) * 100,
      })),
    item.personId,
    COHORT_WINDOW,
  )

  const costPerHourMedian = median(
    cohort.map((person) => person.costPerHour).filter((cost): cost is number => cost !== null),
  )
  const teamShare = teamTaskShare(allProductivity)

  return (
    <ReportDetailShell
      title={item.personName}
      subtitle={item.role}
      badges={<Badge variant={badge.variant}>{badge.label}</Badge>}
      onClose={onClose}
    >
      <ReportFiguresCard
        figures={[
          {
            label: 'Utilización',
            value: formatPercent(item.utilization != null ? item.utilization * 100 : null),
            tone: utilizationTone(item.utilization),
            emphasis: 'hero',
          },
          { label: 'Horas cargadas', value: formatHours(item.hoursLogged) },
        ]}
      />

      <ReportComparisonSection
        title="Comparativa · Utilización"
        ranking={ranking}
        ariaLabel={`Utilización de ${item.personName} comparada con el equipo`}
        formatValue={(value) => formatPercent(value)}
        caption={
          ranking ? `${formatPoints(ranking.deltaVsMedian)} respecto de la mediana del equipo` : ''
        }
        emptyLabel="Sin pares para comparar en este período"
      />

      <ReportDetailSection title="Resumen de carga">
        <ReportDetailRow label="Rol" value={item.role} />
        <ReportDetailRow label="Clientes activos" value={String(item.clientsActive)} />
        <ReportDetailRow label="Horas cargadas" value={formatHours(item.hoursLogged)} />
        <ReportDetailRow label="Capacidad estimada" value={formatHours(item.capacity)} />
      </ReportDetailSection>

      {showMoney ? (
        <ReportDetailSection title="Costo del período">
          {item.personCost == null ? (
            <ReportDetailRow label="Costo total" value="Sin costo asignado" />
          ) : (
            <>
              <ReportDetailRow label="Costo total" value={formatCurrency(item.personCost)} />
              {item.costedAssignments < item.totalAssignments ? (
                <ReportDetailRow
                  label="Cobertura"
                  value={`${item.costedAssignments} de ${item.totalAssignments} clientes con costo cargado`}
                />
              ) : null}
              <ReportDetailRow
                label="Costo por hora"
                value={
                  item.costPerHour === null
                    ? 'Sin horas cargadas'
                    : formatCurrency(item.costPerHour)
                }
              />
            </>
          )}
          <ReportDetailRow
            label="Costo por hora · mediana del equipo"
            value={costPerHourMedian > 0 ? formatCurrency(costPerHourMedian) : 'Sin dato'}
          />
        </ReportDetailSection>
      ) : null}

      <ReportDetailSection title="Fuera de alcance">
        <ReportDetailRow
          label="Horas no facturadas"
          value={
            extras.length === 0
              ? 'Sin extras en el período'
              : `${formatHours(extraHours)} (${formatPercent(extraShare)} de sus horas)`
          }
        />
        <ReportDetailRow label="Cargas fuera de alcance" value={String(extras.length)} />
      </ReportDetailSection>

      <section className="flex flex-col gap-2">
        <h3 className="type-caption fg-subtle">Mix de tareas vs. el equipo</h3>
        <Card>
          <CardContent className="flex flex-col gap-3">
            <DistributionDonut
              data={byTask}
              ariaLabel={`Distribución de tareas de ${item.personName}`}
            />
            {personHours > 0 ? (
              <div className="flex flex-col gap-1.5">
                {byTask.map((task) => {
                  const own = (task.value / personHours) * 100
                  const team = teamShare.get(task.id) ?? 0
                  return (
                    <div key={task.id} className="flex items-center justify-between gap-3">
                      <span className="type-body-2 fg-subtle truncate">{task.label}</span>
                      <span className="type-body-2 fg-default tabular-nums shrink-0">
                        {formatPercent(own)}
                        <span className="fg-subtle"> · equipo {formatPercent(team)}</span>
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="type-caption fg-subtle">Horas por cliente</h3>
        <Card>
          <CardContent>
            <HoursBarChart
              data={byClient}
              ariaLabel={`Horas por cliente de ${item.personName}`}
              color="aqua"
              tailNoun={{ one: 'cliente', many: 'clientes' }}
            />
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="type-caption fg-subtle">Evolución mensual</h3>
        <Card>
          <CardContent>
            <TrendLineChart
              data={history}
              ariaLabel={`Evolución de horas de ${item.personName}`}
              formatValue={(value) => formatHours(value)}
              color="blue"
            />
          </CardContent>
        </Card>
      </section>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outlined"
          color="primary"
          onClick={() =>
            navigate(
              buildTrailHref(`/team?open=${item.personId}`, CARGA_CRUMB, new URLSearchParams()),
            )
          }
        >
          Ver perfil en Equipo
        </Button>
        <Button
          variant="outlined"
          color="primary"
          onClick={() =>
            navigate(
              buildTrailHref(
                `/operacion-mensual?block=equipo&open=${item.personId}`,
                CARGA_CRUMB,
                new URLSearchParams(),
              ),
            )
          }
        >
          Ver horas en operación mensual
        </Button>
      </div>
    </ReportDetailShell>
  )
}

import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { cn } from '@/app/lib/utils'
import { buildTrailHref } from '@/app/lib/nav-trail'
import { hasCapability } from '@hold/shared'
import { useRole } from '@/app/lib/use-role'
import { type TeamPerspective, canSelfTrack, isManagerPerspective } from '@/app/lib/role-access'
import { AFFORDANCE, ICON, type Icon } from '@/app/lib/icon-registry'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Alert,
  AlertDescription,
  AlertTitle,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Badge,
  type BadgeVariant,
  Button,
  Card,
  CardContent,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  Progress,
  Separator,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/app/components/components'
import { AiInsight } from '@/app/components/patterns'
import { SectionHeader, PanelContent } from '@/app/components/templates'
import { monthsSince, paymentDisplay, profitabilityBadge } from './clients-format'
import { PreviewSurface } from './clients-preview'
import type {
  ActivityEvent,
  ActivityKind,
  Client,
  ExpenseStatus,
  ExtraStatus,
  ProductionStatus,
  TeamMember,
} from './team-mock-data'
import { useTeamData } from './team-data'
import {
  assignmentStatusBadge,
  bankBadge,
  compensationDisplay,
  expenseStatusBadge,
  EMPLOYMENT_TYPE_LABEL,
  NO_RECORD,
  extraStatusBadge,
  formatCurrency,
  formatDayMonth,
  formatMonthYear,
  initials,
  isBankComplete,
  loadBadge,
  LOAD_PROGRESS_TONE,
  objectiveStatusBadge,
  OBJECTIVE_PROGRESS_TONE,
  taskStatusBadge,
  PAYMENT_TYPE_LABEL,
  paymentActionForStatus,
  paymentDueLabel,
  paymentStatusBadge,
  productionStatusBadge,
  TEAM_STATUS_LABEL,
  teamStatusBadge,
  type MemberAlert,
  type TeamInsightActionKind,
} from './team-format'
import { LogProductionItem, useCanCreateProduction } from './log-production-item'
import { EditAssignmentDialog } from './assignment-edit-dialog'

export const TEAM_DETAIL_TABS = ['resumen', 'trabajo', 'pagos', 'clientes'] as const
export type TeamDetailTab = (typeof TEAM_DETAIL_TABS)[number]

const TEAM_DETAIL_TAB_ALIASES: Record<string, TeamDetailTab> = {
  carga: 'trabajo',
  actividad: 'trabajo',
  tareas: 'trabajo',
  datos: 'resumen',
}

export function coerceTeamDetailTab(raw: string | null | undefined): TeamDetailTab | undefined {
  if (raw == null) return undefined
  if ((TEAM_DETAIL_TABS as readonly string[]).includes(raw)) return raw as TeamDetailTab
  return TEAM_DETAIL_TAB_ALIASES[raw]
}

export type TeamDetailProps = {
  member: TeamMember | null
  perspective?: TeamPerspective
  initialTab?: TeamDetailTab
  onClose: () => void
  onEdit: (member: TeamMember) => void
  onInvite?: (member: TeamMember) => void
  onLogHours: (member: TeamMember) => void
  onAddProduction: (member: TeamMember) => void
  onAddExpense: (member: TeamMember) => void
  onAddExtra: (member: TeamMember) => void
  onApprovePayment: (member: TeamMember) => void
  onApproveExtras: (member: TeamMember) => void
  onPayDifference: (member: TeamMember) => void
  onConfirmPaid: (member: TeamMember) => void
  onAssignToClient: (member: TeamMember) => void
  onDeactivate: (member: TeamMember) => void
}

const NO_NOTES = 'Sin notas'

function LeadingIcon({ icon: Icon }: { icon: Icon }) {
  return (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-alpha-subtle bg-alpha-subtle fg-subtle">
      <Icon className="size-3.5" aria-hidden />
    </span>
  )
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="type-body-2 fg-subtle">{label}</span>
      <span className="type-body-2 text-right fg-default">{value}</span>
    </div>
  )
}

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="type-caption fg-subtle">{title}</h3>
      <Card>
        <CardContent className="flex flex-col gap-1.5">{children}</CardContent>
      </Card>
    </section>
  )
}

const ALERT_VARIANT: Record<MemberAlert['tone'], 'info' | 'warning' | 'danger'> = {
  neutral: 'info',
  warning: 'warning',
  danger: 'danger',
}

function InsightBanner({
  member,
  onAction,
}: {
  member: TeamMember
  onAction: (kind: TeamInsightActionKind, member: TeamMember) => void
}) {
  const td = useTeamData()
  const insight = td.teamInsightDisplay(member)
  return (
    <AiInsight
      variant="prominent"
      headline={insight.headline}
      ctaLabel={insight.action.label}
      onCta={() => onAction(insight.action.kind, member)}
    />
  )
}

function SummaryCard({ member, managerActions }: { member: TeamMember; managerActions: boolean }) {
  const td = useTeamData()
  const statement = td.statementForMember(member.id)
  const facts = [
    `${td.trackedHoursForMember(member.id)} h cargadas`,
    `${td.clientsForMember(member.id).length} clientes`,
    `${td.productionsCountForMember(member.id)} producciones`,
  ].join(' · ')
  return (
    <section className="flex flex-col gap-2">
      <h3 className="type-caption fg-subtle">Resumen del mes</h3>
      <Card>
        <CardContent>
          <div className="flex flex-col gap-1">
            {managerActions ? (
              <>
                <span className="type-caption fg-subtle">Pago estimado del mes</span>
                <span className="type-metric fg-default tabular-nums">
                  {statement ? formatCurrency(statement.totalAmount) : NO_RECORD}
                </span>
              </>
            ) : null}
            <span className="type-body-2 fg-subtle">{facts}</span>
          </div>
          <Separator />
          <div className="flex flex-col gap-1.5">
            {managerActions ? (
              <DetailRow
                label="Estado de pago"
                value={
                  statement ? (
                    <Badge variant={paymentStatusBadge(statement.status).variant}>
                      {paymentStatusBadge(statement.status).label}
                    </Badge>
                  ) : (
                    NO_RECORD
                  )
                }
              />
            ) : null}
            <DetailRow
              label="Carga mensual"
              value={
                <span className="flex items-center gap-1.5">
                  <span className="tabular-nums">{td.loadHoursLabel(member.id)}</span>
                  <Badge variant={loadBadge(td.loadStatusForMember(member.id)).variant}>
                    {loadBadge(td.loadStatusForMember(member.id)).label}
                  </Badge>
                </span>
              }
            />
          </div>
        </CardContent>
      </Card>
    </section>
  )
}

function AlertsList({
  member,
  onAction,
}: {
  member: TeamMember
  onAction: (kind: TeamInsightActionKind, member: TeamMember) => void
}) {
  const td = useTeamData()
  const alerts = td.memberAlerts(member)
  if (alerts.length === 0) return null
  const bankComplete = isBankComplete(member)
  return (
    <section className="flex flex-col gap-2">
      {alerts.map((alert) => {
        const payBlocked = alert.action.kind === 'payDifference' && !bankComplete
        return (
          <Alert
            key={alert.label}
            variant={ALERT_VARIANT[alert.tone]}
            action={
              <Button
                variant="outlined"
                color="primary"
                size="dense"
                disabled={payBlocked}
                title={payBlocked ? 'Completá los datos bancarios primero' : undefined}
                onClick={() => onAction(alert.action.kind, member)}
              >
                {alert.action.label}
              </Button>
            }
          >
            <AlertTitle>{alert.label}</AlertTitle>
            {alert.description ? <AlertDescription>{alert.description}</AlertDescription> : null}
          </Alert>
        )
      })}
    </section>
  )
}

function LoadCard({ member }: { member: TeamMember }) {
  const td = useTeamData()
  const assignments = td.assignmentsForMember(member.id)
  const status = td.loadStatusForMember(member.id)
  const tracked = td.trackedHoursForMember(member.id)
  const expected = td.expectedHoursForMember(member.id)
  const diff = tracked - expected
  return (
    <section className="flex flex-col gap-2">
      <h3 className="type-caption fg-subtle">Carga mensual</h3>
      <Card>
        <CardContent>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <span className="type-metric fg-default tabular-nums">{td.loadHoursLabel(member.id)}</span>
              <Badge variant={loadBadge(status).variant}>{loadBadge(status).label}</Badge>
            </div>
            <Progress
              value={td.loadPercent(member.id)}
              tone={status ? LOAD_PROGRESS_TONE[status] : 'default'}
              aria-label={`Carga mensual de ${member.name}`}
            />
            {expected > 0 ? (
              <span className="type-caption fg-subtle tabular-nums">
                {diff >= 0 ? `+${diff} h sobre lo esperado` : `${diff} h respecto a lo esperado`}
              </span>
            ) : (
              <span className="type-caption fg-subtle">Sin objetivo de horas definido</span>
            )}
          </div>

          {td.isAssignmentsError ? (
            <p className="type-body-2 fg-subtle">No pudimos cargar los clientes asignados.</p>
          ) : assignments.length > 0 ? (
            <>
              <Separator />
              <Accordion type="single" collapsible>
                <AccordionItem value="detalle">
                  <AccordionTrigger>Detalle por cliente</AccordionTrigger>
                  <AccordionContent>
                    <div className="flex flex-col gap-2">
                      {assignments.map((assignment) => {
                        const tasks = td
                          .timeEntriesForMember(member.id)
                          .filter((entry) => entry.clientId === assignment.clientId).length
                        const clientHours = td.trackedHoursForMemberClient(member.id, assignment.clientId)
                        const badge = assignmentStatusBadge(assignment.status ?? 'active')
                        return (
                          <div key={assignment.id} className="flex items-center justify-between gap-3">
                            <div className="flex min-w-0 flex-col">
                              <span className="truncate type-body-2 fg-default">{assignment.clientName}</span>
                              <span className="type-caption fg-subtle tabular-nums">
                                {clientHours} h · {tasks} {tasks === 1 ? 'tarea' : 'tareas'}
                              </span>
                            </div>
                            <Badge variant={badge.variant}>{badge.label}</Badge>
                          </div>
                        )
                      })}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </>
          ) : null}
        </CardContent>
      </Card>
    </section>
  )
}

function KpiTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 px-3 py-2">
      <span className="type-caption fg-subtle">{label}</span>
      <span className="type-mono-2 fg-default tabular-nums">{value}</span>
    </div>
  )
}

function ProductivityCard({ member }: { member: TeamMember }) {
  const td = useTeamData()
  return (
    <section className="flex flex-col gap-2">
      <h3 className="type-caption fg-subtle">Productividad</h3>
      <Card>
        <CardContent className="grid grid-cols-2 gap-2">
          <KpiTile label="Horas cargadas" value={`${td.trackedHoursForMember(member.id)} h`} />
          <KpiTile label="Clientes activos" value={String(td.clientsForMember(member.id).length)} />
          <KpiTile label="Producciones" value={String(td.productionsCountForMember(member.id))} />
          <KpiTile label="Extras cargados" value={String(td.extrasForMember(member.id).length)} />
        </CardContent>
      </Card>
    </section>
  )
}

function StatementCard({
  member,
  managerActions,
  onApprovePayment,
  onPayDifference,
  onConfirmPaid,
}: {
  member: TeamMember
  managerActions: boolean
  onApprovePayment: (member: TeamMember) => void
  onPayDifference: (member: TeamMember) => void
  onConfirmPaid: (member: TeamMember) => void
}) {
  const td = useTeamData()
  const navigate = useNavigate()
  const statement = td.statementForMember(member.id)
  if (!statement) {
    return (
      <section className="flex flex-col gap-2">
        <h3 className="type-caption fg-subtle">Cuenta corriente</h3>
        <Card>
          <CardContent className="flex flex-col items-start gap-2">
            <span className="type-body-2 fg-subtle">
              {td.isPayoutsError
                ? 'No pudimos cargar los pagos del mes.'
                : 'Sin plan del mes. El pago se arma en Operación mensual.'}
            </span>
            {td.isPayoutsError ? (
              <Button variant="outlined" color="primary" size="dense" onClick={() => td.refetch()}>
                Reintentar
              </Button>
            ) : managerActions ? (
              <Button
                variant="outlined"
                color="primary"
                size="dense"
                onClick={() => navigate('/operacion-mensual')}
              >
                Ir a Operación mensual
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </section>
    )
  }
  const rows: { label: string; amount: number }[] = [
    { label: 'Base mensual', amount: statement.baseAmount },
    { label: 'Horas', amount: statement.hoursAmount },
    { label: 'Producciones', amount: statement.productionsAmount },
    { label: 'Extras', amount: statement.extrasAmount },
    { label: 'Viáticos', amount: statement.expensesAmount },
  ].filter((row) => row.amount > 0)
  const badge = paymentStatusBadge(statement.status)
  const isProcessing = statement.status === 'processing'
  const showProgress =
    (statement.status === 'with_difference' || isProcessing) && statement.differenceAmount != null
  const remainingLabel = isProcessing ? 'En proceso' : 'Queda por pagar'
  const progressTone = isProcessing ? 'fg-warning' : 'fg-danger'
  const due = paymentDueLabel(statement.dueDate)
  const bankComplete = isBankComplete(member)
  return (
    <section className="flex flex-col gap-2">
      <h3 className="type-caption fg-subtle">Cuenta corriente</h3>
      <Card>
        <CardContent className="flex flex-col gap-1.5">
          {rows.map((row) => (
            <DetailRow
              key={row.label}
              label={row.label}
              value={<span className="tabular-nums">{formatCurrency(row.amount)}</span>}
            />
          ))}
          {statement.deductionsAmount > 0 ? (
            <DetailRow
              label="Descuentos"
              value={<span className="tabular-nums">- {formatCurrency(statement.deductionsAmount)}</span>}
            />
          ) : null}
          <Separator />
          <div className="flex flex-col gap-1">
            <span className="type-caption fg-subtle">Total a pagar</span>
            <span className="type-metric fg-default tabular-nums">{formatCurrency(statement.totalAmount)}</span>
          </div>
          {showProgress ? (
            <>
              <DetailRow
                label="Pagado"
                value={<span className="tabular-nums">{formatCurrency(statement.paidAmount ?? 0)}</span>}
              />
              <div className="flex items-center justify-between gap-4">
                <span className={cn('type-body-2', progressTone)}>{remainingLabel}</span>
                <span className={cn('type-body-2 tabular-nums', progressTone)}>
                  {formatCurrency(statement.differenceAmount ?? 0)}
                </span>
              </div>
            </>
          ) : null}
          <DetailRow label="Estado" value={<Badge variant={badge.variant}>{badge.label}</Badge>} />
          {statement.status !== 'paid' ? (
            <DetailRow
              label="Vencimiento"
              value={
                <span className={cn('tabular-nums', due.overdue ? 'fg-danger' : 'fg-default')}>{due.text}</span>
              }
            />
          ) : null}
          {!managerActions ? null : statement.status === 'with_difference' ? (
            <Button
              variant="solid"
              color="primary"
              size="dense"
              className="mt-2 self-start"
              disabled={!bankComplete}
              title={!bankComplete ? 'Completá los datos bancarios primero' : undefined}
              onClick={() => onPayDifference(member)}
            >
              Pagar
            </Button>
          ) : isProcessing ? (
            <Button
              variant="solid"
              color="primary"
              size="dense"
              className="mt-2 self-start"
              onClick={() => onConfirmPaid(member)}
            >
              Confirmar pagado
            </Button>
          ) : statement.status !== 'paid' ? (
            <Button
              variant="solid"
              color="primary"
              size="dense"
              className="mt-2 self-start"
              onClick={() => onApprovePayment(member)}
            >
              {statement.status === 'approved' ? 'Pagar' : 'Aprobar pago'}
            </Button>
          ) : null}
        </CardContent>
      </Card>
    </section>
  )
}

function PaymentDataCard({ member }: { member: TeamMember }) {
  const comp = member.compensation
  return (
    <SectionCard title="Datos de pago">
      <DetailRow label="Tipo de pago" value={PAYMENT_TYPE_LABEL[comp.model]} />
      <DetailRow label="Tarifa" value={compensationDisplay(member)} />
      <DetailRow label="Moneda" value={comp.currency} />
    </SectionCard>
  )
}

type RecordBadge = { label: string; variant: BadgeVariant }

function RecordList({
  title,
  icon,
  rows,
  action,
}: {
  title: string
  icon: Icon
  rows: { id: string; primary: string; secondary: string; amount?: string; badge: RecordBadge }[]
  action?: ReactNode
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="type-caption fg-subtle">{title}</h3>
        {action}
      </div>
      <Card>
        <CardContent className="flex flex-col gap-3">
          {rows.length > 0 ? (
            rows.map((row) => (
              <div key={row.id} className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <LeadingIcon icon={icon} />
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate type-body-2 fg-default">{row.primary}</span>
                    <span className="type-caption fg-subtle">{row.secondary}</span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {row.amount ? (
                    <span className="type-body-2 fg-default tabular-nums">{row.amount}</span>
                  ) : null}
                  <Badge variant={row.badge.variant}>{row.badge.label}</Badge>
                </div>
              </div>
            ))
          ) : (
            <span className="type-body-2 fg-subtle">Sin registro</span>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button variant="transparent" color="primary" size="dense" onClick={onClick}>
      <AFFORDANCE.create className="size-4" aria-hidden />
      {label}
    </Button>
  )
}

function MemberObjectivesCard({ member }: { member: TeamMember }) {
  const td = useTeamData()
  const objectives = td.objectivesForMember(member.id)
  return (
    <section className="flex flex-col gap-2">
      <h3 className="type-caption fg-subtle">Objetivos</h3>
      <Card>
        <CardContent>
          {objectives.length > 0 ? (
            objectives.map((objective) => {
              const badge = objectiveStatusBadge(objective.status)
              return (
                <div key={objective.id} className="flex flex-col gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate type-body-2 fg-default">{objective.title}</span>
                      <span className="type-caption fg-subtle">
                        {objective.clientName ?? 'General'} · vence {formatDayMonth(objective.dueDate)}
                      </span>
                    </div>
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </div>
                  <div className="flex items-center gap-3">
                    <Progress
                      value={objective.progress}
                      tone={OBJECTIVE_PROGRESS_TONE[objective.status]}
                      aria-label={`Progreso de ${objective.title}`}
                      className="grow"
                    />
                    <span className="shrink-0 type-caption fg-subtle tabular-nums">
                      {objective.progress}%
                    </span>
                  </div>
                </div>
              )
            })
          ) : (
            <span className="type-body-2 fg-subtle">Sin objetivos</span>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

function MemberTasksCard({ member }: { member: TeamMember }) {
  const td = useTeamData()
  const tasks = td.tasksForMember(member.id)
  return (
    <section className="flex flex-col gap-2">
      <h3 className="type-caption fg-subtle">Tareas</h3>
      <Card>
        <CardContent className="flex flex-col gap-3">
          {tasks.length > 0 ? (
            tasks.map((task) => {
              const badge = taskStatusBadge(task.status)
              return (
                <div key={task.id} className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate type-body-2 fg-default">{task.title}</span>
                    <span className="type-caption fg-subtle">
                      {task.clientName ?? 'Sin cliente'} · vence {formatDayMonth(task.dueDate)}
                    </span>
                  </div>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                </div>
              )
            })
          ) : (
            <span className="type-body-2 fg-subtle">Sin tareas</span>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

function ProductionsCard({
  member,
  selfTrack,
  onAddProduction,
}: {
  member: TeamMember
  selfTrack: boolean
  onAddProduction: (member: TeamMember) => void
}) {
  const canCreateProduction = useCanCreateProduction()
  const td = useTeamData()
  const rows = td.productionsForMember(member.id).map((entry) => ({
    id: entry.id,
    primary: entry.type,
    secondary: `${entry.clientName} · ${formatMonthYear(entry.date)}`,
    amount: entry.amount ? formatCurrency(entry.amount) : undefined,
    badge: productionStatusBadge(entry.status),
  }))
  return (
    <RecordList
      title="Producciones"
      icon={ICON.production}
      rows={rows}
      action={
        selfTrack && canCreateProduction ? (
          <AddButton label="Cargar producción" onClick={() => onAddProduction(member)} />
        ) : undefined
      }
    />
  )
}

function ExpensesCard({
  member,
  selfTrack,
  onAddExpense,
}: {
  member: TeamMember
  selfTrack: boolean
  onAddExpense: (member: TeamMember) => void
}) {
  const td = useTeamData()
  const rows = td.expensesForMember(member.id).map((entry) => ({
    id: entry.id,
    primary: entry.concept,
    secondary: `${entry.clientName ?? 'Sin cliente'} · ${formatMonthYear(entry.date)}`,
    amount: formatCurrency(entry.amount),
    badge: expenseStatusBadge(entry.status),
  }))
  return (
    <RecordList
      title="Viáticos"
      icon={ICON.expense}
      rows={rows}
      action={selfTrack ? <AddButton label="Cargar viático" onClick={() => onAddExpense(member)} /> : undefined}
    />
  )
}

function ExtrasCard({
  member,
  selfTrack,
  onAddExtra,
}: {
  member: TeamMember
  selfTrack: boolean
  onAddExtra: (member: TeamMember) => void
}) {
  const td = useTeamData()
  const rows = td.extrasForMember(member.id).map((entry) => ({
    id: entry.id,
    primary: entry.description,
    secondary: `${entry.clientName} · ${formatMonthYear(entry.date)}`,
    amount: formatCurrency(entry.amount),
    badge: extraStatusBadge(entry.status),
  }))
  return (
    <RecordList
      title="Trabajos extra"
      icon={ICON.addExtraWork}
      rows={rows}
      action={selfTrack ? <AddButton label="Cargar extra" onClick={() => onAddExtra(member)} /> : undefined}
    />
  )
}

function PaymentsCard({ member }: { member: TeamMember }) {
  const td = useTeamData()
  const rows = td.paymentHistoryForMember(member.id).map((entry) => ({
    id: entry.id,
    primary: formatMonthYear(entry.iso),
    secondary: entry.method,
    amount: formatCurrency(entry.amount),
    badge: paymentStatusBadge(entry.status),
  }))
  return <RecordList title="Últimos pagos" icon={ICON.payment} rows={rows} />
}

const ACTIVITY_ICON: Record<ActivityKind, Icon> = {
  task: ICON.logHours,
  production: ICON.production,
  expense: ICON.expense,
  extra: ICON.addExtraWork,
}

const ACTIVITY_KIND_LABEL: Record<ActivityKind, string> = {
  task: 'Tarea',
  production: 'Producción',
  expense: 'Viático',
  extra: 'Extra',
}

function activityBadge(event: ActivityEvent): { label: string; variant: BadgeVariant } | null {
  if (!event.status) return null
  switch (event.kind) {
    case 'production':
      return productionStatusBadge(event.status as ProductionStatus)
    case 'expense':
      return expenseStatusBadge(event.status as ExpenseStatus)
    case 'extra':
      return extraStatusBadge(event.status as ExtraStatus)
    case 'task':
      return null
  }
}

function activityMetric(event: ActivityEvent): string | null {
  if (event.amount != null) return formatCurrency(event.amount)
  if (event.hours != null) return `${event.hours} h`
  return null
}

function ActivityRow({ event }: { event: ActivityEvent }) {
  const badge = activityBadge(event)
  const metric = activityMetric(event)
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <LeadingIcon icon={ACTIVITY_ICON[event.kind]} />
        <div className="flex min-w-0 flex-col">
          <span className="truncate type-body-2 fg-default">{event.title}</span>
          <span className="truncate type-caption fg-subtle">
            {ACTIVITY_KIND_LABEL[event.kind]} · {event.clientName}
            {event.loggedBy ? ` · por ${event.loggedBy}` : null}
          </span>
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        {metric ? <span className="type-body-2 fg-default tabular-nums">{metric}</span> : null}
        {badge ? (
          <Badge variant={badge.variant}>{badge.label}</Badge>
        ) : event.isOutOfScope ? (
          <Badge variant="warning">Fuera de scope</Badge>
        ) : null}
      </div>
    </div>
  )
}

function ActivityFeed({ member }: { member: TeamMember }) {
  const td = useTeamData()
  const events = td.activityEventsForMember(member.id)
  if (events.length === 0) {
    return (
      <Card>
        <CardContent>
          <span className="type-body-2 fg-subtle">Sin actividad este mes</span>
        </CardContent>
      </Card>
    )
  }
  const days: { date: string; events: ActivityEvent[] }[] = []
  for (const event of events) {
    const last = days[days.length - 1]
    if (last && last.date === event.date) last.events.push(event)
    else days.push({ date: event.date, events: [event] })
  }
  return (
    <div className="flex flex-col gap-4">
      {days.map((day) => (
        <section key={day.date} className="flex flex-col gap-2">
          <h3 className="type-caption fg-subtle">{formatDayMonth(day.date)}</h3>
          <Card>
            <CardContent className="flex flex-col gap-3">
              {day.events.map((event) => (
                <ActivityRow key={event.id} event={event} />
              ))}
            </CardContent>
          </Card>
        </section>
      ))}
    </div>
  )
}

function ClientHealthContent({ client }: { client: Client }) {
  const { capabilities } = useRole()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const pay = paymentDisplay(client)
  const profit = profitabilityBadge(client)
  return (
    <div className="flex flex-col gap-3">
      <span className="truncate type-heading fg-default">{client.name}</span>
      <Separator />
      <div className="flex flex-col gap-1.5">
        <DetailRow
          label="Estado de pago"
          value={
            pay ? (
              <Badge variant={pay.variant}>{pay.label}</Badge>
            ) : (
              <span className="fg-subtle">Sin cobro este mes</span>
            )
          }
        />
        <DetailRow
          label="Fee mensual"
          value={<span className="tabular-nums">{formatCurrency(client.monthlyFee)}</span>}
        />
        {hasCapability(capabilities, 'profitability') && (
          <DetailRow
            label="Rentabilidad"
            value={profit ? <Badge variant={profit.variant}>{profit.label}</Badge> : NO_RECORD}
          />
        )}
      </div>
      <Button
        variant="outlined"
        color="primary"
        size="dense"
        onClick={() => navigate(buildTrailHref(`/clients?open=${client.id}`, { label: 'Equipo', to: '/team' }, searchParams))}
      >
        Ver perfil
      </Button>
    </div>
  )
}

function ClientNameLink({
  clientId,
  clientName,
  managerActions,
}: {
  clientId: string
  clientName: string
  managerActions: boolean
}) {
  const td = useTeamData()
  const client = td.clientById(clientId)
  if (!managerActions || !client)
    return <span className="truncate type-button fg-default">{clientName}</span>
  return (
    <PreviewSurface
      title={client.name}
      content={<ClientHealthContent client={client} />}
      trigger={
        <button
          type="button"
          className="min-w-0 truncate rounded-control type-button fg-default outline-none focus-visible:ring-2 focus-visible:ring-focus"
        >
          {clientName}
        </button>
      }
    />
  )
}

function AssignmentsCard({
  member,
  managerActions,
}: {
  member: TeamMember
  managerActions: boolean
}) {
  const td = useTeamData()
  const { capabilities } = useRole()
  const showCost = hasCapability(capabilities, 'teamCost')
  const assignments = td.assignmentsForMember(member.id)
  const live = assignments.filter((a) => a.status !== 'ended')
  const costed = live.filter((a) => a.monthlyCost != null)
  const costTotal = costed.reduce((sum, a) => sum + (a.monthlyCost ?? 0), 0)
  const [editingId, setEditingId] = useState<string | null>(null)
  const editing = live.find((a) => a.id === editingId)
  return (
    <section className="flex flex-col gap-2">
      <h3 className="type-caption fg-subtle">Clientes asignados</h3>
      <Card>
        <CardContent className="flex flex-col gap-3">
          {showCost && live.length > 0 ? (
            <div className="flex flex-col gap-0.5 border-b border-alpha-subtle pb-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="type-body-2 fg-subtle">Asignado a clientes</span>
                <span className="type-mono tabular-nums fg-default">
                  {costed.length > 0 ? formatCurrency(costTotal) : 'Sin costo cargado'}
                </span>
              </div>
              {costed.length < live.length ? (
                <span className="type-caption fg-subtle">
                  {`${costed.length} de ${live.length} clientes con costo cargado`}
                </span>
              ) : null}
            </div>
          ) : null}
          {assignments.length > 0 ? (
            assignments.map((assignment) => {
              const badge = assignmentStatusBadge(assignment.status ?? 'active')
              const since = assignment.assignedSince
              const tenure = since ? `${monthsSince(since)} meses` : null
              return (
                <div
                  key={assignment.id}
                  className="flex flex-col gap-1 border-b border-alpha-subtle pb-3 last:border-0 last:pb-0"
                >
                  <div className="flex items-center justify-between gap-3">
                    <ClientNameLink
                      clientId={assignment.clientId}
                      clientName={assignment.clientName}
                      managerActions={managerActions}
                    />
                    <div className="flex items-center gap-1">
                      <Badge variant={badge.variant}>{badge.label}</Badge>
                      {managerActions && assignment.status !== 'ended' ? (
                        <IconButton
                          variant="transparent"
                          size="dense"
                          aria-label={`Editar la asignación en ${assignment.clientName}`}
                          onClick={() => setEditingId(assignment.id)}
                        >
                          <ICON.edit className="size-4" aria-hidden />
                        </IconButton>
                      ) : null}
                    </div>
                  </div>
                  <span className="type-caption fg-subtle">
                    {assignment.serviceName ?? 'Servicio sin definir'} · {assignment.roleOnClient}
                  </span>
                  {showCost ? (
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="type-caption fg-subtle">Le pagamos por este cliente</span>
                      <span className="type-body-2 tabular-nums fg-default">
                        {assignment.monthlyCost != null
                          ? formatCurrency(assignment.monthlyCost)
                          : 'Sin cargar'}
                      </span>
                    </div>
                  ) : null}
                  <span className="type-caption fg-subtle">
                    {since ? `Desde ${formatMonthYear(since)}` : 'Sin fecha de inicio'}
                    {tenure ? ` · ${tenure}` : null}
                    {assignment.estimatedMonthlyHours
                      ? ` · ${assignment.estimatedMonthlyHours} h/mes estimadas`
                      : null}
                  </span>
                </div>
              )
            })
          ) : (
            <span className="type-body-2 fg-subtle">Esta persona no tiene clientes asignados</span>
          )}
        </CardContent>
      </Card>
      {editing ? (
        <EditAssignmentDialog
          assignment={editing}
          memberName={member.name}
          onClose={() => setEditingId(null)}
        />
      ) : null}
    </section>
  )
}

function InfoGeneralCard({ member }: { member: TeamMember }) {
  return (
    <SectionCard title="Información general">
      <DetailRow label="Email" value={member.email ?? NO_RECORD} />
      <DetailRow label="Teléfono" value={member.phone ?? NO_RECORD} />
      <DetailRow label="Rol" value={member.role} />
      <DetailRow label="Tipo" value={EMPLOYMENT_TYPE_LABEL[member.employmentType]} />
      <DetailRow
        label="Estado"
        value={
          <Badge variant={teamStatusBadge(member.status).variant}>
            {teamStatusBadge(member.status).label}
          </Badge>
        }
      />
      <DetailRow
        label="Fecha de ingreso"
        value={member.startDate ? formatMonthYear(member.startDate) : NO_RECORD}
      />
      <DetailRow label="Notas" value={member.notes ?? NO_NOTES} />
    </SectionCard>
  )
}

function BankDataCard({ member }: { member: TeamMember }) {
  const bank = member.bank
  const badge = bankBadge(member)
  return (
    <section className="flex flex-col gap-2">
      <h3 className="type-caption fg-subtle">Datos bancarios</h3>
      <Card>
        <CardContent className="flex flex-col gap-1.5">
          <DetailRow label="Estado" value={<Badge variant={badge.variant}>{badge.label}</Badge>} />
          <DetailRow label="Banco" value={bank?.bankName ?? NO_RECORD} />
          <DetailRow label="Titular" value={bank?.accountHolder ?? NO_RECORD} />
          <DetailRow label="CBU / CVU" value={<span className="tabular-nums">{bank?.cbuOrCvu ?? NO_RECORD}</span>} />
          <DetailRow label="Alias" value={bank?.alias ?? NO_RECORD} />
          <DetailRow label="CUIT / CUIL" value={<span className="tabular-nums">{member.taxId ?? NO_RECORD}</span>} />
        </CardContent>
      </Card>
    </section>
  )
}

function mailtoHref(member: TeamMember): string | undefined {
  return member.email ? `mailto:${member.email}` : undefined
}

function whatsappHref(member: TeamMember): string | undefined {
  if (!member.phone) return undefined
  return `https://wa.me/${member.phone.replace(/\D/g, '')}`
}

function openExternalLink(href?: string) {
  if (href) window.open(href, '_blank', 'noopener,noreferrer')
}

function HeroAction({
  icon: ActionIcon,
  label,
  ariaLabel,
  onClick,
  disabled,
}: {
  icon: Icon
  label: string
  ariaLabel: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <IconButton
        variant="outlined"
        color="primary"
        size="dense"
        aria-label={ariaLabel}
        onClick={onClick}
        disabled={disabled}
      >
        <ActionIcon className="size-4" aria-hidden />
      </IconButton>
      <span className={cn('type-body-2', disabled ? 'fg-subtle' : 'fg-default')}>{label}</span>
    </div>
  )
}

function HeroActions({
  member,
  onPayment,
  paymentLabel,
  onEdit,
  onInvite,
  onLogHours,
  onAddProduction,
  onAddExpense,
  onAddExtra,
  onAssignToClient,
  onDeactivate,
}: {
  member: TeamMember
  onPayment?: () => void
  paymentLabel: string
  onEdit: (member: TeamMember) => void
  onInvite?: (member: TeamMember) => void
  onLogHours: (member: TeamMember) => void
  onAddProduction: (member: TeamMember) => void
  onAddExpense: (member: TeamMember) => void
  onAddExtra: (member: TeamMember) => void
  onAssignToClient: (member: TeamMember) => void
  onDeactivate: (member: TeamMember) => void
}) {
  const mailto = mailtoHref(member)
  const whatsapp = whatsappHref(member)
  return (
    <>
      <HeroAction
        icon={ICON.payment}
        label="Pago"
        ariaLabel={paymentLabel}
        onClick={() => onPayment?.()}
        disabled={!onPayment}
      />
      <div className="flex flex-col items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton variant="outlined" color="primary" size="dense" aria-label="Cargar">
              <ICON.logWork className="size-4" aria-hidden />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center">
            <DropdownMenuItem onSelect={() => onLogHours(member)}>
              <ICON.logHours aria-hidden />
              Cargar horas
            </DropdownMenuItem>
            <LogProductionItem onSelect={() => onAddProduction(member)} />
            <DropdownMenuItem onSelect={() => onAddExpense(member)}>
              <ICON.expense aria-hidden />
              Cargar viático
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onAddExtra(member)}>
              <ICON.addExtraWork aria-hidden />
              Cargar extra
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="type-body-2 fg-default">Cargar</span>
      </div>
      <HeroAction
        icon={ICON.assignPerson}
        label="Asignar"
        ariaLabel="Asignar a cliente"
        onClick={() => onAssignToClient(member)}
      />
      <div className="flex flex-col items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton variant="outlined" color="primary" size="dense" aria-label="Más acciones">
              <AFFORDANCE.overflow className="size-4" aria-hidden />
            </IconButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center">
            <DropdownMenuItem onSelect={() => onEdit(member)}>
              <ICON.edit aria-hidden />
              Editar persona
            </DropdownMenuItem>
            {onInvite ? (
              <DropdownMenuItem onSelect={() => onInvite(member)}>
                <ICON.invitePerson aria-hidden />
                Invitar a la app
              </DropdownMenuItem>
            ) : null}
            <DropdownMenuItem disabled={!mailto} onSelect={() => openExternalLink(mailto)}>
              <ICON.email aria-hidden />
              Enviar mail
            </DropdownMenuItem>
            <DropdownMenuItem disabled={!whatsapp} onSelect={() => openExternalLink(whatsapp)}>
              <ICON.whatsapp aria-hidden />
              Enviar WhatsApp
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={() => onDeactivate(member)}>
              <ICON.churn aria-hidden />
              Dar de baja
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <span className="type-body-2 fg-default">Más</span>
      </div>
    </>
  )
}

function SelfCargarAction({ member, onLogHours, onAddProduction, onAddExpense, onAddExtra }: {
  member: TeamMember
  onLogHours: (member: TeamMember) => void
  onAddProduction: (member: TeamMember) => void
  onAddExpense: (member: TeamMember) => void
  onAddExtra: (member: TeamMember) => void
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton variant="outlined" color="primary" size="dense" aria-label="Cargar">
            <ICON.logWork className="size-4" aria-hidden />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center">
          <DropdownMenuItem onSelect={() => onLogHours(member)}>
            <ICON.logHours aria-hidden />
            Cargar horas
          </DropdownMenuItem>
          <LogProductionItem onSelect={() => onAddProduction(member)} />
          <DropdownMenuItem onSelect={() => onAddExpense(member)}>
            <ICON.expense aria-hidden />
            Cargar viático
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onAddExtra(member)}>
            <ICON.addExtraWork aria-hidden />
            Cargar extra
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="type-body-2 fg-default">Cargar</span>
    </div>
  )
}

function DetailHero({
  member,
  heroRef,
  selfTrack,
  managerActions,
  onClose,
  onPayment,
  paymentLabel,
  onEdit,
  onInvite,
  onLogHours,
  onAddProduction,
  onAddExpense,
  onAddExtra,
  onAssignToClient,
  onDeactivate,
}: {
  member: TeamMember
  heroRef: Ref<HTMLDivElement>
  selfTrack: boolean
  managerActions: boolean
  onClose: () => void
  onPayment?: () => void
  paymentLabel: string
  onEdit: (member: TeamMember) => void
  onInvite?: (member: TeamMember) => void
  onLogHours: (member: TeamMember) => void
  onAddProduction: (member: TeamMember) => void
  onAddExpense: (member: TeamMember) => void
  onAddExtra: (member: TeamMember) => void
  onAssignToClient: (member: TeamMember) => void
  onDeactivate: (member: TeamMember) => void
}) {
  return (
    <div ref={heroRef} className="relative flex flex-col items-center gap-4 text-center">
      {managerActions ? (
        <IconButton
          className="absolute top-0 right-0"
          variant="transparent"
          color="primary"
          aria-label="Cerrar detalle"
          onClick={onClose}
        >
          <AFFORDANCE.close className="size-5" aria-hidden />
        </IconButton>
      ) : null}
      <Avatar size="xxl" active>
        {member.avatarUrl ? <AvatarImage src={member.avatarUrl} alt={member.name} /> : null}
        <AvatarFallback>{initials(member.name)}</AvatarFallback>
      </Avatar>
      <div className="flex flex-col gap-1">
        <h2 className="type-section fg-default">{member.name}</h2>
        <p className="type-body-2 fg-subtle">
          {member.role} · {TEAM_STATUS_LABEL[member.status]}
        </p>
      </div>
      {managerActions ? (
        <div className="flex flex-wrap items-start justify-center gap-6">
          <HeroActions
            member={member}
            onPayment={onPayment}
            paymentLabel={paymentLabel}
            onEdit={onEdit}
            {...(onInvite ? { onInvite } : {})}
            onLogHours={onLogHours}
            onAddProduction={onAddProduction}
            onAddExpense={onAddExpense}
            onAddExtra={onAddExtra}
            onAssignToClient={onAssignToClient}
            onDeactivate={onDeactivate}
          />
        </div>
      ) : selfTrack ? (
        <div className="flex flex-wrap items-start justify-center gap-6">
          <SelfCargarAction
            member={member}
            onLogHours={onLogHours}
            onAddProduction={onAddProduction}
            onAddExpense={onAddExpense}
            onAddExtra={onAddExtra}
          />
        </div>
      ) : null}
    </div>
  )
}

export function TeamDetail({
  member,
  perspective = 'manager',
  initialTab,
  onClose,
  onEdit,
  onInvite,
  onLogHours,
  onAddProduction,
  onAddExpense,
  onAddExtra,
  onApprovePayment,
  onApproveExtras,
  onPayDifference,
  onConfirmPaid,
  onAssignToClient,
  onDeactivate,
}: TeamDetailProps) {
  const td = useTeamData()
  const selfTrack = canSelfTrack(perspective)
  const managerActions = isManagerPerspective(perspective)
  const scrollRef = useRef<HTMLDivElement>(null)
  const heroRef = useRef<HTMLDivElement>(null)
  const [scrolled, setScrolled] = useState(false)
  const memberId = member?.id
  const [activeTab, setActiveTab] = useState<TeamDetailTab>(
    !managerActions && initialTab === 'pagos' ? 'resumen' : (initialTab ?? 'resumen'),
  )

  const runAction = (kind: TeamInsightActionKind, target: TeamMember) => {
    switch (kind) {
      case 'edit':
        return onEdit(target)
      case 'reviewLoad':
        return setActiveTab('trabajo')
      case 'logHours':
        return onLogHours(target)
      case 'approvePayment':
        return onApprovePayment(target)
      case 'approveExtras':
        return onApproveExtras(target)
      case 'payDifference':
        return onPayDifference(target)
      case 'confirmPaid':
        return onConfirmPaid(target)
    }
  }

  useEffect(() => {
    setScrolled(false)
    const root = scrollRef.current
    const hero = heroRef.current
    if (!root || !hero) return
    const observer = new IntersectionObserver(
      ([entry]) => setScrolled(!entry.isIntersecting),
      { root, rootMargin: '-56px 0px 0px 0px', threshold: 0 },
    )
    observer.observe(hero)
    return () => observer.disconnect()
  }, [memberId])

  if (!member) return null

  const paymentAction = paymentActionForStatus(td.statementForMember(member.id)?.status)
  const onPayment = paymentAction ? () => runAction(paymentAction.kind, member) : undefined
  const paymentLabel = paymentAction?.label ?? 'Pago'

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        className={cn(
          'absolute inset-x-0 top-0 z-20 bg-page transition-opacity duration-[var(--motion-duration-quick)]',
          scrolled ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      >
        <SectionHeader
          title={member.name}
          actionsInline={false}
          description={`${member.role} · ${TEAM_STATUS_LABEL[member.status]}`}
          leading={
            <Avatar size="lg" active>
              {member.avatarUrl ? <AvatarImage src={member.avatarUrl} alt={member.name} /> : null}
              <AvatarFallback>{initials(member.name)}</AvatarFallback>
            </Avatar>
          }
          actions={
            managerActions ? (
              <>
              <Button
                variant="solid"
                color="primary"
                size="dense"
                disabled={!onPayment}
                onClick={() => onPayment?.()}
              >
                Pago
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IconButton variant="transparent" color="primary" size="dense" aria-label="Más acciones">
                    <AFFORDANCE.overflow className="size-5" aria-hidden />
                  </IconButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => onLogHours(member)}>
                    <ICON.logHours aria-hidden />
                    Cargar horas
                  </DropdownMenuItem>
                  <LogProductionItem onSelect={() => onAddProduction(member)} />
                  <DropdownMenuItem onSelect={() => onAddExpense(member)}>
                    <ICON.expense aria-hidden />
                    Cargar viático
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onAddExtra(member)}>
                    <ICON.addExtraWork aria-hidden />
                    Cargar extra
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onAssignToClient(member)}>
                    <ICON.assignPerson aria-hidden />
                    Asignar a cliente
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onEdit(member)}>
                    <ICON.edit aria-hidden />
                    Editar persona
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={!mailtoHref(member)} onSelect={() => openExternalLink(mailtoHref(member))}>
                    <ICON.email aria-hidden />
                    Enviar mail
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={!whatsappHref(member)}
                    onSelect={() => openExternalLink(whatsappHref(member))}
                  >
                    <ICON.whatsapp aria-hidden />
                    Enviar WhatsApp
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => onDeactivate(member)}>
                    <ICON.churn aria-hidden />
                    Dar de baja
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Separator orientation="vertical" className="h-6 self-center" />
              <IconButton variant="transparent" color="primary" aria-label="Cerrar detalle" onClick={onClose}>
                <AFFORDANCE.close className="size-5" aria-hidden />
              </IconButton>
              </>
            ) : selfTrack ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <IconButton variant="outlined" color="primary" size="dense" aria-label="Cargar">
                    <ICON.logWork className="size-5" aria-hidden />
                  </IconButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => onLogHours(member)}>
                    <ICON.logHours aria-hidden />
                    Cargar horas
                  </DropdownMenuItem>
                  <LogProductionItem onSelect={() => onAddProduction(member)} />
                  <DropdownMenuItem onSelect={() => onAddExpense(member)}>
                    <ICON.expense aria-hidden />
                    Cargar viático
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => onAddExtra(member)}>
                    <ICON.addExtraWork aria-hidden />
                    Cargar extra
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : undefined
          }
        />
      </div>

      <PanelContent ref={scrollRef} layout="stacked">
        <DetailHero
          member={member}
          heroRef={heroRef}
          selfTrack={selfTrack}
          managerActions={managerActions}
          onClose={onClose}
          onPayment={onPayment}
          paymentLabel={paymentLabel}
          onEdit={onEdit}
          {...(onInvite ? { onInvite } : {})}
          onLogHours={onLogHours}
          onAddProduction={onAddProduction}
          onAddExpense={onAddExpense}
          onAddExtra={onAddExtra}
          onAssignToClient={onAssignToClient}
          onDeactivate={onDeactivate}
        />

        <Tabs
          value={activeTab}
          onValueChange={(value) => setActiveTab(value as TeamDetailTab)}
          className="mt-4 gap-6"
        >
          <TabsList className="self-center">
            <TabsTrigger value="resumen">Resumen</TabsTrigger>
            <TabsTrigger value="trabajo">Trabajo</TabsTrigger>
            {managerActions ? <TabsTrigger value="pagos">Pagos</TabsTrigger> : null}
            <TabsTrigger value="clientes">Clientes</TabsTrigger>
          </TabsList>

          <TabsContent value="resumen">
            <div className="flex flex-col gap-4 md:gap-6">
              {managerActions ? <InsightBanner member={member} onAction={runAction} /> : null}
              <SummaryCard member={member} managerActions={managerActions} />
              {managerActions ? <AlertsList member={member} onAction={runAction} /> : null}
              <ProductivityCard member={member} />
              <InfoGeneralCard member={member} />
              {!managerActions ? <BankDataCard member={member} /> : null}
            </div>
          </TabsContent>

          <TabsContent value="trabajo">
            <div className="flex flex-col gap-4 md:gap-6">
              <LoadCard member={member} />
              <ProductionsCard
                member={member}
                selfTrack={selfTrack || managerActions}
                onAddProduction={onAddProduction}
              />
              <ExpensesCard
                member={member}
                selfTrack={selfTrack || managerActions}
                onAddExpense={onAddExpense}
              />
              <ExtrasCard member={member} selfTrack={selfTrack || managerActions} onAddExtra={onAddExtra} />
              <MemberObjectivesCard member={member} />
              <MemberTasksCard member={member} />
              <ActivityFeed member={member} />
            </div>
          </TabsContent>

          {managerActions ? (
            <TabsContent value="pagos">
              <div className="flex flex-col gap-4 md:gap-6">
                <StatementCard
                  member={member}
                  managerActions={managerActions}
                  onApprovePayment={onApprovePayment}
                  onPayDifference={onPayDifference}
                  onConfirmPaid={onConfirmPaid}
                />
                <PaymentsCard member={member} />
                <PaymentDataCard member={member} />
                <BankDataCard member={member} />
              </div>
            </TabsContent>
          ) : null}

          <TabsContent value="clientes">
            <AssignmentsCard member={member} managerActions={managerActions} />
          </TabsContent>
        </Tabs>
      </PanelContent>
    </div>
  )
}

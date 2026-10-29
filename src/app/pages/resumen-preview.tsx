import { hasCapability } from '@hold/shared'
import { useRole } from '@/app/lib/use-role'
import { cn } from '@/app/lib/utils'
import { Avatar, AvatarFallback, Badge, Separator } from '@/app/components/components'
import { initials } from './cobranza-format'
import { KPI_TONE_FG } from '@/app/components/patterns'
import {
  type KpiTone,
  capacityStatusBadge,
  formatCurrency,
  formatHours,
  formatPercent,
  formatRelativeDate,
  profitabilityStatusBadge,
} from './reports-format'
import type { ClientProfitabilityReportItem, TeamCapacityReportItem } from './reports-types'

function PreviewStat({ label, value, tone }: { label: string; value: string; tone?: KpiTone }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="type-body-2 fg-subtle">{label}</span>
      <span className={cn('type-body-2 tabular-nums', KPI_TONE_FG[tone ?? 'default'])}>{value}</span>
    </div>
  )
}

export function ClientProfitabilityPreviewBody({ client }: { client: ClientProfitabilityReportItem }) {
  const { capabilities } = useRole()
  const showProfitability = hasCapability(capabilities, 'profitability')
  const badge = profitabilityStatusBadge(client.status)
  const marginTone: KpiTone = client.margen < 0 ? 'danger' : client.margen < 22 ? 'warning' : 'success'
  return (
    <div className="flex flex-col gap-3">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="truncate type-heading fg-default">{client.clientName}</span>
        <span className="truncate type-body-2 fg-subtle">
          {client.clientType ? `${client.clientType} · ${client.service}` : client.service}
        </span>
      </div>
      {showProfitability && <Badge variant={badge.variant}>{badge.label}</Badge>}
      <Separator />
      <div className="flex flex-col gap-2">
        {showProfitability && (
          <>
            <PreviewStat label="Margen" value={formatPercent(client.margen)} tone={marginTone} />
            <PreviewStat
              label="Rentabilidad"
              value={formatCurrency(client.rentabilidad)}
              tone={client.rentabilidad >= 0 ? 'success' : 'danger'}
            />
          </>
        )}
        <PreviewStat label="Horas" value={formatHours(client.horas)} />
        <PreviewStat label="Último aumento" value={formatRelativeDate(client.lastIncreaseDate)} />
      </div>
    </div>
  )
}

export function TeamCapacityPreviewBody({ person }: { person: TeamCapacityReportItem }) {
  const badge = capacityStatusBadge(person.status)
  const utilTone: KpiTone =
    person.utilization == null
      ? 'default'
      : person.utilization > 1
        ? 'danger'
        : person.utilization < 0.6
          ? 'warning'
          : 'success'
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Avatar size="lg">
          <AvatarFallback>{initials(person.personName)}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col">
          <span className="truncate type-heading fg-default">{person.personName}</span>
          <span className="truncate type-body-2 fg-subtle">{person.role}</span>
        </div>
      </div>
      <Badge variant={badge.variant}>{badge.label}</Badge>
      <Separator />
      <div className="flex flex-col gap-2">
        <PreviewStat
          label="Utilización"
          value={formatPercent(person.utilization != null ? person.utilization * 100 : null)}
          tone={utilTone}
        />
        <PreviewStat label="Horas cargadas" value={formatHours(person.hoursLogged)} />
        <PreviewStat label="Clientes activos" value={String(person.clientsActive)} />
        <PreviewStat label="Capacidad estimada" value={formatHours(person.capacity)} />
      </div>
    </div>
  )
}

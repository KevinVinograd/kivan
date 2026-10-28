import { hasCapability } from '@hold/shared'
import { useRole } from '@/app/lib/use-role'
import { cn } from '@/app/lib/utils'
import { Avatar, AvatarFallback, Badge, Separator } from '@/app/components/components'
import { initials } from './cobranza-format'
// KPI_TONE_FG moved to the patterns barrel with the KpiSummaryCard rollout (dev). The
// PreviewSurface import is gone: Reportes no longer previews an entity on hover, so this
// module only supplies the shared bodies the dashboard activity feed still renders.
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

/**
 * The shared client / person preview bodies for the dashboard recent-activity feed.
 *
 * Reportes itself no longer previews an entity on hover: a client or a person row opens
 * the full entity drawer (`client-detail` / `person-detail`) instead, so the compact
 * hover cards that used to wrap these bodies are gone. The bodies survive because the
 * dashboard activity feed still previews the same two entities and must read the same.
 */

/** One label/value figure row inside a preview body. */
function PreviewStat({ label, value, tone }: { label: string; value: string; tone?: KpiTone }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="type-body-2 fg-subtle">{label}</span>
      <span className={cn('type-body-2 tabular-nums', KPI_TONE_FG[tone ?? 'default'])}>{value}</span>
    </div>
  )
}

/**
 * Canonical client preview body: name + type·service, a capability-gated profitability
 * badge, and the Margen / Rentabilidad (capability-gated) / Horas / Último aumento
 * figures. Owner-only figures are role-gated here (F2), so admins see the operational
 * subset automatically.
 */
export function ClientProfitabilityPreviewBody({ client }: { client: ClientProfitabilityReportItem }) {
  const { capabilities } = useRole()
  // Profitability tier, Margen and Rentabilidad need the `profitability` capability; roles without it
  // keep the operational signals (Horas, Último aumento) only.
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

/**
 * Canonical person preview body: avatar + name + role, a capacity badge, and the
 * Utilización / Horas cargadas / Clientes activos / Capacidad estimada figures.
 */
export function TeamCapacityPreviewBody({ person }: { person: TeamCapacityReportItem }) {
  const badge = capacityStatusBadge(person.status)
  // Untinted when there is no configured capacity: a colour here would grade someone
  // against a target nobody set.
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

import type { ReactNode } from 'react'
import type { NavigateFunction } from 'react-router'

import { cn } from '@/app/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  buttonVariants,
} from '@/app/components/components'
import { buildTrailHref } from '@/app/lib/nav-trail'
import { AFFORDANCE, ICON } from '@/app/lib/icon-registry'
import { RESUMEN_CRUMB } from './reports-trail'
import type { ReportTab } from './reports-tabs-header'
import type { ClientProfitabilityReportItem, TeamCapacityReportItem } from './reports-types'

/** Trailing "more actions" control shared by the Resumen tables (desktop) and the
 *  mobile card-list: an overflow dropdown that views the entity and links out to
 *  its module. */
export function RowActionsMenu({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-end">
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={label}
          className={cn(buttonVariants({ variant: 'transparent', color: 'primary' }), 'size-8 shrink-0')}
        >
          <AFFORDANCE.overflow className="size-4" aria-hidden />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">{children}</DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

/** Overflow actions for an at-risk client row (shared desktop table + mobile list). */
export function RiskClientActions({
  client,
  onTabChange,
  navigate,
}: {
  client: ClientProfitabilityReportItem
  onTabChange: (tab: ReportTab) => void
  navigate: NavigateFunction
}) {
  return (
    <RowActionsMenu label={`Acciones de ${client.clientName}`}>
      <DropdownMenuItem onSelect={() => onTabChange('rentabilidad')}>
        <ICON.view aria-hidden />
        Ver en rentabilidad
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onSelect={() =>
          navigate(
            buildTrailHref(
              `/clients?open=${encodeURIComponent(client.clientId)}`,
              RESUMEN_CRUMB,
              new URLSearchParams(),
            ),
          )
        }
      >
        <ICON.clients aria-hidden />
        Ver cliente
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() =>
          navigate(
            buildTrailHref(
              `/operacion-mensual?block=clientes&open=${encodeURIComponent(client.clientId)}`,
              RESUMEN_CRUMB,
              new URLSearchParams(),
            ),
          )
        }
      >
        <ICON.monthlyOperation aria-hidden />
        Ver operación mensual
      </DropdownMenuItem>
      {/* /cobros has no ?open= deep-link, so this one carries no subject (the tab is the
          subject-less list). Left as a plain link rather than a param the page ignores. */}
      <DropdownMenuItem
        onSelect={() => navigate(buildTrailHref('/cobros', RESUMEN_CRUMB, new URLSearchParams()))}
      >
        <ICON.finance aria-hidden />
        Ver cobros
      </DropdownMenuItem>
    </RowActionsMenu>
  )
}

/** Overflow actions for a most-loaded person row (shared desktop table + mobile list). */
export function LoadedPersonActions({
  person,
  onTabChange,
  navigate,
}: {
  person: TeamCapacityReportItem
  onTabChange: (tab: ReportTab) => void
  navigate: NavigateFunction
}) {
  return (
    <RowActionsMenu label={`Acciones de ${person.personName}`}>
      <DropdownMenuItem onSelect={() => onTabChange('carga')}>
        <ICON.view aria-hidden />
        Ver en carga de equipo
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem
        onSelect={() =>
          navigate(
            buildTrailHref(
              `/team?open=${encodeURIComponent(person.personId)}`,
              RESUMEN_CRUMB,
              new URLSearchParams(),
            ),
          )
        }
      >
        <ICON.team aria-hidden />
        Ver perfil en Equipo
      </DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() =>
          navigate(
            buildTrailHref(
              `/operacion-mensual?block=equipo&open=${encodeURIComponent(person.personId)}`,
              RESUMEN_CRUMB,
              new URLSearchParams(),
            ),
          )
        }
      >
        <ICON.monthlyOperation aria-hidden />
        Ver horas en operación mensual
      </DropdownMenuItem>
    </RowActionsMenu>
  )
}

import { useMemo } from 'react'

import { hasCapability } from '@hold/shared'
import { useRole } from '@/app/lib/use-role'
import { KpiSummaryCard, type Kpi } from '@/app/components/patterns'
import type { TeamMember } from './clients-mock-data'
import { formatCompactCurrency } from './clients-format'
import type { TeamDataContextValue } from './team-data'

/**
 * Roster summary card above the Equipo toolbar. Only the owner/admin table view
 * reaches it — the employee perspective renders its own read-only profile, never
 * this row. Nómina estimada is compensation/cost — needs `teamCost`; a role without it
 * keeps the operational figures (activo, sobrecargados, producciones) without the
 * payroll. Figures span the whole roster, independent of the table filters.
 *
 * §6 focal figure, by role: the owner's protagonist is the money question the page
 * answers — Nómina estimada, the `type-metric` hero. A role without `teamCost` never sees payroll, so
 * their protagonist is the roster's operational risk — Sobrecargados, a small number
 * made focal by isolation and placement (never by a tint). Everything else steps down
 * to the `type-metric-2` supporting grid.
 */
export function TeamSummaryKpis({
  members,
  td,
}: {
  members: TeamMember[]
  td: TeamDataContextValue
}) {
  const { role, capabilities } = useRole()

  // Figures stay `fg-default` (the default tone): no roster figure IS a threshold status
  // (the per-member load state is the table's read, and the hints carry the signal), so
  // none earns a tint per figure-color-restraint.
  const kpis = useMemo<Kpi[]>(() => {
    const active = members.filter((member) => member.status === 'active')
    const overloaded = members.filter((member) => td.loadStatusForMember(member.id) === 'overloaded').length
    const productions = members.reduce((sum, member) => sum + td.productionsCountForMember(member.id), 0)
    const showPayroll = hasCapability(capabilities, 'teamCost')

    const list: Kpi[] = [
      {
        id: 'active',
        label: 'Equipo activo',
        value: String(active.length),
        hint: `de ${members.length} en total`,
      },
      {
        id: 'overloaded',
        label: 'Sobrecargados',
        value: String(overloaded),
        hint: overloaded > 0 ? 'sobre su objetivo' : 'Sin sobrecarga',
      },
      {
        id: 'productions',
        label: 'Producciones',
        value: String(productions),
        hint: 'entregas del mes',
      },
    ]

    if (showPayroll) {
      // Sums the REAL statements only. Members with no plan for the month contribute
      // nothing and are counted in the hint, so a partially-planned month cannot read
      // as a complete payroll figure.
      const planned = members.filter((member) => td.statementForMember(member.id))
      const payroll = planned.reduce(
        (sum, member) => sum + (td.statementForMember(member.id)?.totalAmount ?? 0),
        0,
      )
      list.push({
        id: 'payroll',
        label: 'Nómina estimada',
        value: formatCompactCurrency(payroll),
        hint:
          planned.length === members.length
            ? 'pago estimado del mes'
            : `${planned.length} de ${members.length} con plan del mes`,
      })
    }

    return list
  }, [members, td, role])

  // The focal figure, named in one place (the `heroId` convention `KpiSummaryCard`
  // uses): a role holding `teamCost` leads with the money it owes; one without it
  // leads with the roster's operational risk.
  const heroId = hasCapability(capabilities, 'teamCost') ? 'payroll' : 'overloaded'

  return <KpiSummaryCard figures={kpis} heroId={heroId} collapsible storageKey="team" />
}

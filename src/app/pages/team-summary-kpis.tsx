import { useMemo } from 'react'

import { hasCapability } from '@hold/shared'
import { useRole } from '@/app/lib/use-role'
import { KpiSummaryCard, type Kpi } from '@/app/components/patterns'
import type { TeamMember } from './clients-mock-data'
import { formatCompactCurrency } from './clients-format'
import type { TeamDataContextValue } from './team-data'

export function TeamSummaryKpis({
  members,
  td,
}: {
  members: TeamMember[]
  td: TeamDataContextValue
}) {
  const { role, capabilities } = useRole()

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

  const heroId = hasCapability(capabilities, 'teamCost') ? 'payroll' : 'overloaded'

  return <KpiSummaryCard figures={kpis} heroId={heroId} collapsible storageKey="team" />
}

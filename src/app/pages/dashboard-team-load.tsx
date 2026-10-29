import { useNavigate } from 'react-router'

import { SectionHeader } from '@/app/components/templates'
import { Avatar, AvatarFallback, Badge, Card, CardContent } from '@/app/components/components'
import { KpiSummaryCard, type Kpi } from '@/app/components/patterns'
import { buildTrailHref } from '@/app/lib/nav-trail'
import { DashboardCta, FloatingCardCta } from './dashboard-cta'
import { initials } from './clients-format'
import { formatHours, teamLoadBadge } from './dashboard-format'
import type { TeamLoad, TeamLoadMember } from './dashboard-types'

const TEAM_LOAD_CTA_HREF = buildTrailHref(
  '/reports?tab=carga',
  { label: 'Dashboard', to: '/dashboard' },
  new URLSearchParams(),
)

function MemberCard({ member }: { member: TeamLoadMember }) {
  const navigate = useNavigate()
  const status = teamLoadBadge(member.status)
  const href = buildTrailHref(
    `/team?open=${member.personId}`,
    { label: 'Dashboard', to: '/dashboard' },
    new URLSearchParams(),
  )
  return (
    <Card interactive onClick={() => navigate(href)} className="group relative overflow-hidden">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Avatar>
              <AvatarFallback>{initials(member.personName)}</AvatarFallback>
            </Avatar>
            <span className="type-section fg-default">{member.personName}</span>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="type-mono-2 tabular-nums fg-default">
            {formatHours(member.hours)} / {formatHours(member.capacity)} estipuladas
          </span>
          <span className="type-caption tabular-nums fg-subtle">{member.clientsCount} clientes</span>
        </div>
        <FloatingCardCta href={href}>Ver persona</FloatingCardCta>
      </CardContent>
    </Card>
  )
}

export function TeamLoadSnapshot({ teamLoad }: { teamLoad: TeamLoad }) {
  const figures: Kpi[] = [
    {
      id: 'overloaded',
      label: 'Con sobrecarga',
      value: String(teamLoad.overloaded),
      tone: teamLoad.overloaded > 0 ? 'warning' : 'default',
    },
    { id: 'total-hours', label: 'Horas cargadas', value: formatHours(teamLoad.totalHours) },
    { id: 'average-hours', label: 'Promedio por persona', value: formatHours(teamLoad.averageHours) },
    { id: 'underloaded', label: 'Con baja carga', value: String(teamLoad.underloaded) },
    {
      id: 'missing-hours',
      label: 'Sin horas',
      value: String(teamLoad.missingHours),
      tone: teamLoad.missingHours > 0 ? 'warning' : 'default',
    },
  ]

  return (
    <section aria-label="Carga del equipo" className="group/team flex flex-col">
      <SectionHeader
        title="Carga del equipo"
        actions={
          <span className="[@media(hover:hover)]:opacity-0 motion-standard group-hover/team:opacity-100 focus-within:opacity-100">
            <DashboardCta href={TEAM_LOAD_CTA_HREF}>Ver equipo</DashboardCta>
          </span>
        }
      />
      <div className="flex flex-col gap-4 md:gap-6 px-4 md:px-6 lg:px-8 xl:pr-5 desktop:pl-10">
        <KpiSummaryCard figures={figures} heroId="overloaded" />
        {teamLoad.members.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {teamLoad.members.map((member) => (
              <MemberCard key={member.personId} member={member} />
            ))}
          </div>
        ) : null}
      </div>
    </section>
  )
}

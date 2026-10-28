import { useNavigate } from 'react-router'

import { SectionHeader } from '@/app/components/templates'
import { Avatar, AvatarFallback, Badge, Card, CardContent } from '@/app/components/components'
import { KpiSummaryCard, type Kpi } from '@/app/components/patterns'
import { buildTrailHref } from '@/app/lib/nav-trail'
import { DashboardCta, FloatingCardCta } from './dashboard-cta'
import { initials } from './clients-format'
import { formatHours, teamLoadBadge } from './dashboard-format'
import type { TeamLoad, TeamLoadMember } from './dashboard-types'

// The dashboard is the trail root, so this section CTA carries a back-trail crumb
// to the dashboard (no inbound trail to forward — `new URLSearchParams()`).
const TEAM_LOAD_CTA_HREF = buildTrailHref(
  '/reports?tab=carga',
  { label: 'Dashboard', to: '/dashboard' },
  new URLSearchParams(),
)

function MemberCard({ member }: { member: TeamLoadMember }) {
  const navigate = useNavigate()
  const status = teamLoadBadge(member.status)
  // Deep-link into Equipo: open this person's detail and carry a Dashboard crumb
  // so Equipo shows a back-to-dashboard trail.
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
          {/* Secondary: hours logged against the stipulated monthly capacity. */}
          <span className="type-mono-2 tabular-nums fg-default">
            {formatHours(member.hours)} / {formatHours(member.capacity)} estipuladas
          </span>
          {/* Tertiary: how many clients this person carries. */}
          <span className="type-caption tabular-nums fg-subtle">{member.clientsCount} clientes</span>
        </div>
        <FloatingCardCta href={href}>Ver persona</FloatingCardCta>
      </CardContent>
    </Card>
  )
}

/**
 * §7 Carga del equipo. Helps owners spot overload, bottlenecks and delivery
 * risk, not police hours: the load totals plus a per-person list (one card each,
 * mirroring Clientes en riesgo) with status, any related client risk and a
 * hover/focus "Ver persona" deep-link.
 */
export function TeamLoadSnapshot({ teamLoad }: { teamLoad: TeamLoad }) {
  // Hero: how many people are overloaded — the panel's whole reason to exist. The rest is
  // the load context behind that count.
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
      {/* "Ver equipo" is hidden on hover-capable pointers and fades in (motion-standard)
          when the mouse enters the section or the button takes keyboard focus; on touch it
          stays visible. The action keeps to the title row, far right, at every width. */}
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

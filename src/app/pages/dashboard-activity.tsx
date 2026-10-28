import * as React from 'react'
import { useNavigate } from 'react-router'

import { cn } from '@/app/lib/utils'
import { buildTrailHref } from '@/app/lib/nav-trail'
import { SectionHeader } from '@/app/components/templates'
import { Avatar, AvatarFallback, Button, Card, CardContent, Separator } from '@/app/components/components'
import { type Icon } from '@/app/lib/icon-registry'
import { initials } from './cobranza-format'
import { PreviewSurface } from './clients-preview'
import { ClientProfitabilityPreviewBody, TeamCapacityPreviewBody } from './resumen-preview'
import { ActivityDrawer } from './activity-drawer'
import { activityIcon, formatRelativeDate } from './dashboard-format'
import type { ActivityItem, DashboardActivityEntity } from './dashboard-types'
import type { ActivityPreviews } from './dashboard-activity-previews'
import type { ClientProfitabilityReportItem, TeamCapacityReportItem } from './reports-types'

/** Round leading glyph for the timeline (local, mirroring the detail-panel pattern). */
function LeadingIcon({ icon: Glyph }: { icon: Icon }) {
  return (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-alpha-subtle bg-alpha-subtle fg-subtle">
      <Glyph className="size-3.5" aria-hidden />
    </span>
  )
}

/**
 * Inline trigger for an entity name; the open behavior is owned by the surrounding
 * PreviewSurface, so it forwards its ref for Radix `asChild`.
 *
 * Deliberately raw markup, and deliberately NOT a <button>: a button box is atomic
 * inline-level content, so the browser cannot break a multi-word name across lines —
 * it pushes the whole name onto its own line and leaves the sentence above it ragged.
 * The Button primitive renders a real <button> and exposes no `asChild` to render
 * another tag, so no primitive can express a trigger
 * that flows and breaks like the running text around it. This is the raw-markup
 * escape hatch: a focusable inline span carrying the
 * button role, plus the Enter/Space activation a native button gives for free.
 */
const EntityTrigger = React.forwardRef<HTMLSpanElement, React.ComponentProps<'span'> & { name: string }>(
  function EntityTrigger({ name, className, onKeyDown, ...props }, ref) {
    return (
      <span
        ref={ref}
        role="button"
        tabIndex={0}
        className={cn(
          'cursor-pointer rounded-control type-body-2 fg-default outline-none focus-visible:ring-2 focus-visible:ring-focus',
          className,
        )}
        onKeyDown={(event) => {
          onKeyDown?.(event)
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            event.currentTarget.click()
          }
        }}
        {...props}
      >
        {name}
      </span>
    )
  },
)

/**
 * Team-member preview: the canonical capacity body (role, utilización, horas,
 * clientes activos) when the person resolves in the report data, else a safe
 * avatar + name + role fallback — plus a Ver perfil CTA into the Equipo detail.
 */
function MemberPreviewContent({
  entity,
  profile,
}: {
  entity: Extract<DashboardActivityEntity, { kind: 'member' }>
  profile?: TeamCapacityReportItem
}) {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col gap-3">
      {profile ? (
        <TeamCapacityPreviewBody person={profile} />
      ) : (
        <>
          <div className="flex items-center gap-3">
            <Avatar size="lg">
              <AvatarFallback>{initials(entity.name)}</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col">
              <span className="truncate type-heading fg-default">{entity.name}</span>
              <span className="truncate type-body-2 fg-subtle">{entity.role}</span>
            </div>
          </div>
          <Separator />
        </>
      )}
      <Button
        variant="outlined"
        color="primary"
        size="dense"
        onClick={() => navigate(buildTrailHref(`/team?open=${entity.id}`, { label: 'Dashboard', to: '/dashboard' }, new URLSearchParams()))}
      >
        Ver perfil
      </Button>
    </div>
  )
}

/**
 * Client preview: the canonical profitability body (type·service, capability-gated
 * margen/rentabilidad, horas, último aumento) when the client resolves in the
 * report data, else a safe name-only fallback — plus a Ver perfil CTA into the
 * Clientes detail.
 */
function ClientPreviewContent({
  entity,
  profile,
}: {
  entity: Extract<DashboardActivityEntity, { kind: 'client' }>
  profile?: ClientProfitabilityReportItem
}) {
  const navigate = useNavigate()
  return (
    <div className="flex flex-col gap-3">
      {profile ? (
        <ClientProfitabilityPreviewBody client={profile} />
      ) : (
        <span className="type-heading fg-default">{entity.name}</span>
      )}
      <Button
        variant="outlined"
        color="primary"
        size="dense"
        onClick={() => navigate(buildTrailHref(`/clients?open=${entity.id}`, { label: 'Dashboard', to: '/dashboard' }, new URLSearchParams()))}
      >
        Ver perfil
      </Button>
    </div>
  )
}

/** Renders one activity entity: hover link-text for clients/members, plain for the rest. */
function ActivityEntityRef({ entity, previews }: { entity: DashboardActivityEntity; previews: ActivityPreviews }) {
  if (entity.kind === 'plain') {
    return <span className="fg-default">{entity.name}</span>
  }
  if (entity.kind === 'client') {
    return (
      <PreviewSurface
        trigger={<EntityTrigger name={entity.name} />}
        title={entity.name}
        content={<ClientPreviewContent entity={entity} profile={previews.clients[entity.id]} />}
      />
    )
  }
  return (
    <PreviewSurface
      trigger={<EntityTrigger name={entity.name} />}
      title={entity.name}
      content={<MemberPreviewContent entity={entity} profile={previews.people[entity.id]} />}
    />
  )
}

function ActivityRow({ item, isLast, previews }: { item: ActivityItem; isLast: boolean; previews: ActivityPreviews }) {
  return (
    <div className="flex gap-3">
      {/* Leading icon + timeline connector linking each entry to the next. */}
      <div className="flex flex-col items-center gap-1">
        <LeadingIcon icon={activityIcon(item.activity)} />
        {!isLast ? <span aria-hidden className="flex-1 border-l border-alpha-subtle" /> : null}
      </div>
      <div className={cn('flex min-w-0 flex-1 items-start justify-between gap-3', !isLast && 'pb-4')}>
        <span className="type-body-2 fg-default">
          <ActivityEntityRef entity={item.actor} previews={previews} /> {item.action}{' '}
          <ActivityEntityRef entity={item.context} previews={previews} />
        </span>
        <span className="whitespace-nowrap type-caption fg-subtle">{formatRelativeDate(item.iso)}</span>
      </div>
    </div>
  )
}

/**
 * §8 Actividad reciente. A read-only timeline of recent workspace events
 * (connecting line + leading kind-icon), shared by the Owner and Admin
 * dashboards. Each client/team-member name is hover link-text whose preview
 * shows the canonical client/person body (role-gated facts, resolved from
 * `previews` by entity id) plus an outlined "Ver perfil" CTA; entries without a
 * profile page (e.g. a production) render as plain text. Destinations carry a
 * `Dashboard` trail crumb so the target shows a back-breadcrumb.
 */
export function RecentActivityList({
  activity,
  previews,
}: {
  activity: ActivityItem[]
  previews: ActivityPreviews
}) {
  return (
    <section aria-label="Actividad reciente" className="group/activity flex flex-col">
      {/* "Ver actividad" is hidden on hover-capable pointers and fades in
          (motion-standard) when the mouse enters the block or the button takes
          keyboard focus; on touch it stays visible. The section header keeps it
          on the title row, far right, at every width (the default). */}
      <SectionHeader
        title="Actividad reciente"
        actions={
          <span className="[@media(hover:hover)]:opacity-0 motion-standard group-hover/activity:opacity-100 focus-within:opacity-100">
            <ActivityDrawer />
          </span>
        }
      />
      <div className="px-4 md:px-6 lg:px-8 xl:pl-5 desktop:pr-10">
        {activity.length > 0 ? (
          <Card>
            <CardContent className="flex flex-col">
              {activity.map((item, index) => (
                <ActivityRow
                  key={item.id}
                  item={item}
                  isLast={index === activity.length - 1}
                  previews={previews}
                />
              ))}
            </CardContent>
          </Card>
        ) : (
          <p className="type-body-2 fg-subtle">No hay actividad reciente para este mes.</p>
        )}
      </div>
    </section>
  )
}

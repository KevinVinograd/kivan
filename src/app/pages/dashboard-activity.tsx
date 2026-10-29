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

function LeadingIcon({ icon: Glyph }: { icon: Icon }) {
  return (
    <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-alpha-subtle bg-alpha-subtle fg-subtle">
      <Glyph className="size-3.5" aria-hidden />
    </span>
  )
}

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

export function RecentActivityList({
  activity,
  previews,
}: {
  activity: ActivityItem[]
  previews: ActivityPreviews
}) {
  return (
    <section aria-label="Actividad reciente" className="group/activity flex flex-col">
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

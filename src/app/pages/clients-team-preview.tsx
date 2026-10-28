import * as React from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { cn } from '@/app/lib/utils'
import { buildTrailHref } from '@/app/lib/nav-trail'
import { Avatar, AvatarFallback, AvatarImage, Button, Separator } from '@/app/components/components'
import { ICON } from '@/app/lib/icon-registry'
import type { TeamMember } from './clients-mock-data'
import { NO_REGISTRO, formatCurrency, initials } from './clients-format'
import { COMPENSATION_MODEL_LABEL, teamMemberPreview, type TeamMemberPreview } from './clients-team'
import { PreviewSurface, PreviewInfoRow } from './clients-preview'

/** Members in the "Equipo" row, capped before the row collapses to `+N`. */
const DEFAULT_MAX_VISIBLE = 3

// ── Inline trigger ───────────────────────────────────────────────────────────
export type TeamMemberInlineProps = React.ComponentProps<'button'> & {
  /** The label rendered as the interactive link (member name, or `+N`). */
  name: string
}

/**
 * Link-styled inline trigger for a team member. Pure visual + focus affordance;
 * the open behavior is owned by the surrounding HoverCard / bottom sheet, so this
 * forwards its ref and spreads props for Radix `asChild`.
 */
export const TeamMemberInline = React.forwardRef<HTMLButtonElement, TeamMemberInlineProps>(
  function TeamMemberInline({ name, className, ...props }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        className={cn(
          'rounded-control type-body-2 fg-default outline-none focus-visible:ring-2 focus-visible:ring-focus',
          className,
        )}
        {...props}
      >
        {name}
      </button>
    )
  },
)

export type TeamMemberPreviewContentProps = {
  data: TeamMemberPreview
}

/**
 * Compact preview body, shared verbatim by the desktop HoverCard and the mobile
 * bottom sheet: avatar + name + role, then payment modality, estimated amount, and time
 * on this client. The two compensation rows are gated on viewer permission; the
 * tenure row always shows.
 */
export function TeamMemberPreviewContent({ data }: TeamMemberPreviewContentProps) {
  const { member, currentClientAssignment: cca, compensation, permissions } = data
  const canViewComp = permissions.canViewCompensation

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Avatar size="lg">
          {member.avatarUrl ? <AvatarImage src={member.avatarUrl} alt={member.name} /> : null}
          <AvatarFallback>{initials(member.name)}</AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col">
          <span className="truncate type-heading fg-default">{member.name}</span>
          <span className="truncate type-body-2 fg-subtle">{member.role}</span>
        </div>
      </div>

      <Separator />

      <div className="flex flex-col gap-2">
        {canViewComp && compensation ? (
          <PreviewInfoRow icon={ICON.compensation}>
            {COMPENSATION_MODEL_LABEL[compensation.model]}
          </PreviewInfoRow>
        ) : null}
        {canViewComp ? (
          <PreviewInfoRow icon={ICON.payment}>
            {cca.estimatedClientCost != null
              ? `${formatCurrency(cca.estimatedClientCost)} estimado`
              : 'No disponible'}
          </PreviewInfoRow>
        ) : null}
        <PreviewInfoRow icon={ICON.duration}>
          {cca.durationLabel ? `Hace ${cca.durationLabel}` : NO_REGISTRO}
        </PreviewInfoRow>
      </div>
    </div>
  )
}

// ── Member preview surface (hover desktop / tap mobile) ──────────────────────
export type TeamMemberHoverCardProps = {
  memberId: string
  clientId: string
  trigger: React.ReactNode
}

/**
 * Wraps an inline trigger with the right preview surface for the device: a
 * desktop HoverCard (hover + focus) or, on mobile, a tap-driven bottom
 * sheet. Both render the same `TeamMemberPreviewContent`.
 */
export function TeamMemberHoverCard({ memberId, clientId, trigger }: TeamMemberHoverCardProps) {
  const navigate = useNavigate()
  // Carry the trail that led into Clientes forward and append a Clientes crumb.
  const [searchParams] = useSearchParams()
  const data = React.useMemo(() => teamMemberPreview(memberId, clientId), [memberId, clientId])

  if (!data) return <>{trigger}</>

  return (
    <PreviewSurface
      trigger={trigger}
      title={data.member.name}
      content={
        <div className="flex flex-col gap-3">
          <TeamMemberPreviewContent data={data} />
          <Button
            variant="outlined"
            color="primary"
            size="dense"
            onClick={() => navigate(buildTrailHref(`/team?open=${memberId}`, { label: 'Clientes', to: '/clients' }, searchParams))}
          >
            Ver perfil
          </Button>
        </div>
      }
    />
  )
}

// ── Overflow surface (`+N`) ──────────────────────────────────────────────────
function TeamOverflowContent({ members }: { members: TeamMember[] }) {
  const navigate = useNavigate()
  // Carry the trail that led into Clientes forward and append a Clientes crumb.
  const [searchParams] = useSearchParams()
  return (
    <div className="flex flex-col gap-2">
      <h4 className="type-caption fg-subtle">Equipo</h4>
      {members.map((m) => (
        <div key={m.id} className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate(buildTrailHref(`/team?open=${m.id}`, { label: 'Clientes', to: '/clients' }, searchParams))}
            className="min-w-0 truncate rounded-control text-left type-body-2 fg-default outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            {m.name}
          </button>
          <span className="whitespace-nowrap type-caption fg-subtle">{m.role}</span>
        </div>
      ))}
    </div>
  )
}

function TeamOverflow({ members, trigger }: { members: TeamMember[]; trigger: React.ReactNode }) {
  return (
    <PreviewSurface
      trigger={trigger}
      title="Equipo"
      content={<TeamOverflowContent members={members} />}
      align="end"
    />
  )
}

// ── Equipo row list ──────────────────────────────────────────────────────────
export type ClientTeamInlineListProps = {
  clientId: string
  members: TeamMember[]
  maxVisible?: number
}

/**
 * The "Equipo" row body: comma-separated member names, each opening a preview,
 * collapsing to `+N` past `maxVisible`. Drop-in for the Resumen card value slot
 * (right-aligned, wraps); falls back to `NO_REGISTRO` when the team is empty.
 */
export function ClientTeamInlineList({
  clientId,
  members,
  maxVisible = DEFAULT_MAX_VISIBLE,
}: ClientTeamInlineListProps) {
  if (members.length === 0) {
    return <span className="type-body-2 fg-subtle">{NO_REGISTRO}</span>
  }

  const visible = members.slice(0, maxVisible)
  const hidden = members.slice(maxVisible)

  return (
    <span className="flex flex-wrap justify-end gap-x-1">
      {visible.map((member, index) => {
        const needsComma = index < visible.length - 1 || hidden.length > 0
        return (
          <span key={member.id} className="whitespace-nowrap">
            <TeamMemberHoverCard
              memberId={member.id}
              clientId={clientId}
              trigger={<TeamMemberInline name={member.name} />}
            />
            {needsComma ? <span className="fg-subtle">,</span> : null}
          </span>
        )
      })}
      {hidden.length > 0 ? (
        <TeamOverflow members={hidden} trigger={<TeamMemberInline name={`+${hidden.length}`} />} />
      ) : null}
    </span>
  )
}

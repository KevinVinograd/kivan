import { useMemo, type ComponentType } from 'react'
import { useSearchParams } from 'react-router'

import {
  MasterDetailLayout,
  PageContent,
  PageHeader,
  PanelContent,
} from '@/app/components/templates'
import { Avatar, AvatarFallback } from '@/app/components/components'
import { cn } from '@/app/lib/utils'
import { AFFORDANCE } from '@/app/lib/icon-registry'
import { trailToHere } from '@/app/lib/nav-trail'
import { useIsBelowDesktop } from '@/app/lib/use-is-mobile'
import { useRole } from '@/app/lib/use-role'
import { useAuth } from '@/app/lib/auth-store'
import { initials } from './clients-format'
import { TrailBreadcrumb } from './trail-breadcrumb'
import { sectionsForRole, type SettingsSectionId } from './settings-config'
import { SettingsWorkspace } from './settings-workspace'
import { SettingsMembers } from './settings-members'
import { SettingsRoles } from './settings-roles'
import { SettingsFiscal } from './settings-fiscal'
import { SettingsOperation } from './settings-operation'
import { SettingsAccounts } from './settings-accounts'
import { SettingsNotifications } from './settings-notifications'
import { SettingsAppearance } from './settings-appearance'
import { SettingsProfile } from './settings-profile'

const SECTION_CONTENT: Record<SettingsSectionId, ComponentType> = {
  workspace: SettingsWorkspace,
  members: SettingsMembers,
  roles: SettingsRoles,
  fiscal: SettingsFiscal,
  operation: SettingsOperation,
  cashflow: SettingsAccounts,
  notifications: SettingsNotifications,
  appearance: SettingsAppearance,
  profile: SettingsProfile,
}

export function SettingsPage() {
  const { role } = useRole()
  const { me } = useAuth()
  const sections = useMemo(() => sectionsForRole(role), [role])
  const belowDesktop = useIsBelowDesktop()
  const [searchParams, setSearchParams] = useSearchParams()

  const myInitials = me ? initials(`${me.firstName} ${me.lastName}`) : ''

  const param = searchParams.get('section')
  const enteredId: SettingsSectionId | null =
    param && sections.some((section) => section.id === param)
      ? (param as SettingsSectionId)
      : null
  const activeId: SettingsSectionId = enteredId ?? sections[0]?.id ?? 'profile'

  const mobileEntered = belowDesktop && enteredId !== null

  function openSection(id: SettingsSectionId) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('section', id)
        return next
      },
      { replace: !belowDesktop },
    )
  }

  const ActiveSection = SECTION_CONTENT[activeId]
  const activeSection = sections.find((section) => section.id === activeId)

  const Chevron = AFFORDANCE.next

  const railActiveId = belowDesktop ? null : activeId

  const inboundTrail = trailToHere(searchParams, '/settings')
  const sectionTrail = [...inboundTrail, { label: 'Configuración', to: '/settings' }]
  const sectionBreadcrumb = (
    <TrailBreadcrumb trail={sectionTrail} leaf={activeSection?.label ?? ''} />
  )

  const stepBreadcrumb = <div className="px-4 pt-4 md:px-6 lg:px-8 desktop:px-10">{sectionBreadcrumb}</div>

  return (
    <>
      {!mobileEntered ? (
        <PageHeader
          eyebrow="Hold"
          eyebrowHidden
          title="Configuración"
          description="Preferencias del espacio de trabajo y de tu cuenta."
          breadcrumb={
            enteredId !== null && inboundTrail.length > 0 ? sectionBreadcrumb : undefined
          }
        />
      ) : null}
      <PageContent>
        <MasterDetailLayout
          selectedId={activeId}
          mobileDetail="step"
          mobileEntered={mobileEntered}
          mobileStepHeader={stepBreadcrumb}
          table={null}
          list={
            <PanelContent layout="stacked" flushTop>
              <nav aria-label="Secciones de configuración" className="flex flex-col gap-1">
                {sections.map((section) => {
                  const active = section.id === railActiveId
                  const Icon = section.icon
                  return (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => openSection(section.id)}
                      aria-current={active ? 'true' : undefined}
                      className={cn(
                        'flex items-center gap-3 rounded-control px-3 py-2 text-left motion-standard focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus',
                        active ? 'bg-alpha-subtle-active' : 'hover:bg-alpha-subtle-hover',
                      )}
                    >
                      {section.id === 'profile' ? (
                        <Avatar size="sm" active={active}>
                          <AvatarFallback>{myInitials}</AvatarFallback>
                        </Avatar>
                      ) : Icon ? (
                        <Icon
                          className={cn('size-5 shrink-0', active ? 'fg-default' : 'fg-subtle')}
                          weight={active ? 'fill' : 'regular'}
                          aria-hidden
                        />
                      ) : null}
                      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="type-button fg-default">{section.label}</span>
                        <span className="type-caption fg-subtle">{section.description}</span>
                      </span>
                      {belowDesktop ? (
                        <Chevron className="size-5 shrink-0 fg-subtle" aria-hidden />
                      ) : null}
                    </button>
                  )
                })}
              </nav>
            </PanelContent>
          }
          detail={<ActiveSection />}
        />
      </PageContent>
    </>
  )
}

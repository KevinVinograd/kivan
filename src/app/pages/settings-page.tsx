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

/** Section id → content component. The rail is built from the registry; this map
 *  resolves the active id to the body that renders in the detail panel. */
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

/**
 * Configuración — the settings module (route `/settings`). On desktop it is a
 * permanent two-pane split built on `MasterDetailLayout`: the compact rail lists
 * the sections the active role may see, and the medium detail panel renders the
 * selected one. On tablet and mobile (below desktop) the split is too narrow, so
 * it becomes a two-step drilldown (`mobileDetail="step"`): step 1 is the section
 * list, and tapping a section opens step 2 — a full-width section page with a
 * breadcrumb (`Configuración` → section) back to the list. The drilled-in section
 * lives in the URL (`?section=<id>`) so the step is back-button friendly and
 * deep-linkable; `activeId` always resolves to a role-visible section so the
 * desktop split is never empty. Visible sections come from `useRole` via the
 * registry, so the Dueño/Admin get the workspace sections while a member of the
 * Equipo only sees their personal preferences. Every section on the rail is real:
 * Miembros (`/users`), Roles (`/roles`) and Mi perfil (`/me/*`) hit the API, Cashflow
 * reads the treasury endpoints, and Apariencia the real `useTheme` hook. The sections
 * that only pretended to save (Espacio de trabajo, Fiscal/ARCA, Operación,
 * Notificaciones) are hidden until they persist — see `HIDDEN_UNTIL_WIRED` in
 * `settings-config` — so nothing on this screen reports a save that never happened.
 */
export function SettingsPage() {
  const { role } = useRole()
  const { me } = useAuth()
  const sections = useMemo(() => sectionsForRole(role), [role])
  const belowDesktop = useIsBelowDesktop()
  const [searchParams, setSearchParams] = useSearchParams()

  // The rail's Perfil row carries the signed-in person's avatar, so the initials come
  // from the real session — never a literal. Empty until `/auth/me` resolves: the
  // Avatar's own fallback shows through rather than someone else's initials.
  const myInitials = me ? initials(`${me.firstName} ${me.lastName}`) : ''

  // The drilled-in section lives in the URL (`?section=<id>`). A param that no
  // role-visible section matches (stale deep-link, or one hidden after a role
  // switch) collapses to "no selection", so a member of the Equipo can never land
  // on a section they may not see. `activeId` always resolves to a visible section
  // so the desktop split (and step 2) is never empty.
  const param = searchParams.get('section')
  const enteredId: SettingsSectionId | null =
    param && sections.some((section) => section.id === param)
      ? (param as SettingsSectionId)
      : null
  const activeId: SettingsSectionId = enteredId ?? sections[0]?.id ?? 'profile'

  // Below desktop only: a valid section param means we are in step 2 (the section
  // page); no param means step 1 (the list). Desktop ignores this and always
  // renders the split.
  const mobileEntered = belowDesktop && enteredId !== null

  function openSection(id: SettingsSectionId) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('section', id)
        return next
      },
      // Push below desktop so Back steps from the section page back to the list;
      // replace on desktop, where there is no list step to return to (avoids
      // piling up history entries as the user clicks through the rail).
      { replace: !belowDesktop },
    )
  }

  const ActiveSection = SECTION_CONTENT[activeId]
  const activeSection = sections.find((section) => section.id === activeId)

  // Trailing disclosure chevron for the section list (registered affordance).
  const Chevron = AFFORDANCE.next

  // Highlight the active rail item only where the detail is actually on screen:
  // the desktop split (and below-desktop step 2 never renders the rail). In
  // below-desktop step 1 nothing is "current" yet, so no item is highlighted.
  const railActiveId = belowDesktop ? null : activeId

  // Contextual back-trail for a drilled-in section. When the user arrived from
  // another module (e.g. Cashflow → "Administrar cuentas"), the incoming `?trail=`
  // is prepended so the chain reads `<origin> → Configuración → <section>` with the
  // origin as a real return link; without an inbound trail it is the plain
  // `Configuración → <section>` step trail (the first crumb links back to /settings).
  const inboundTrail = trailToHere(searchParams, '/settings')
  const sectionTrail = [...inboundTrail, { label: 'Configuración', to: '/settings' }]
  const sectionBreadcrumb = (
    <TrailBreadcrumb trail={sectionTrail} leaf={activeSection?.label ?? ''} />
  )

  // Step-2 back trail (below desktop): the master-detail step drilldown trail,
  // rendered above the section's own SectionHeader. Always shown on step 2.
  const stepBreadcrumb = <div className="px-4 pt-4 md:px-6 lg:px-8 desktop:px-10">{sectionBreadcrumb}</div>

  return (
    <>
      {/* The page-level title carries the list step (and the desktop split). On
          the tablet/mobile section page (step 2) the breadcrumb carries context,
          so the redundant "Configuración" header is dropped. */}
      {!mobileEntered ? (
        <PageHeader
          eyebrow="Hold"
          eyebrowHidden
          title="Configuración"
          description="Preferencias del espacio de trabajo y de tu cuenta."
          // Desktop breadcrumb shown only on a cross-module arrival (an inbound
          // `?trail=`), so the return path back to the origin (e.g. Cashflow) is
          // visible; plain rail navigation needs none (the title + active rail item
          // already place the user — the convention).
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
                      {/* Profile carries the signed-in person's Avatar; every other
                          section carries its registry glyph (filled when active). */}
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
                      {/* Trailing disclosure chevron — a drill affordance shown only
                          below desktop, where tapping a row navigates to the section
                          page (step 2). On desktop the row swaps the split's detail in
                          place, so no chevron. */}
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

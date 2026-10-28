import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Outlet, useLocation, useNavigate } from 'react-router'
import { notificationsApi } from '@/api/notifications'
import { queryKeys } from '@/queries/keys'
import { AppShell, type NavUser, type NewAction, type NavEntry, type NavItem } from '@/app/components/shell'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
  Toaster,
} from '@/app/components/components'
import { ICON } from '@/app/lib/icon-registry'
import { DaytimeProvider } from '@/app/daytime'
import { navItems, footerNavItems } from './nav-items'
import { useTheme } from '@/app/lib/use-theme'
import { ROLE_LABEL, ROLES, useRole } from '@/app/lib/use-role'
import { usePageTitle } from '@/app/lib/use-page-title'
import { canAccessPath } from '@/app/lib/role-access'
import { useAuth } from '@/app/lib/auth-store'
import { useSignOut } from '@/app/lib/use-sign-out'

/**
 * Application layout route. Mounts the app shell once and renders the active
 * page through <Outlet/>; `activePath` is derived from the router location so the
 * SideNav reflects the current route. Product pages live under src/app/pages and
 * are wired in src/app/router.tsx.
 */
export default function App() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { role, permissions } = useRole()
  // The active page title (published by the page's PageHeader) so the mobile
  // shell pill can reveal it on scroll-up; null until a page publishes one.
  const pageTitle = usePageTitle()

  // Nav rails filtered by the active role: a page the role can't access is hidden
  // from the rail (and route-locked by RoleGate). /clients and /team stay visible
  // for every role — their employee restriction is in-page, not nav-level. Group
  // entries are filtered per child; a group with no accessible children is dropped
  // entirely, so an employee sees Finanzas without Reportes rather than an empty
  // group.
  const visibleNavItems = useMemo<NavEntry[]>(() => {
    // The employee only ever sees their own profile on /team, so the rail reads
    // "Mi trabajo" with a single-user icon for them (label + icon only; the href
    // and route are unchanged — the shared "Equipo" entry keeps the roster icon).
    const relabel = (item: NavItem): NavItem =>
      role === 'employee' && item.href === '/team'
        ? { ...item, label: 'Mi trabajo', icon: ICON.myWork }
        : item
    const visible: NavEntry[] = []
    for (const entry of navItems) {
      if ('children' in entry) {
        const children = entry.children.filter((child) => canAccessPath(role, child.href, permissions))
        if (children.length > 0) visible.push({ ...entry, children })
      } else if (canAccessPath(role, entry.href, permissions)) {
        visible.push(relabel(entry))
      }
    }
    return visible
  }, [role, permissions])
  // Unread notices, for the Avisos badge. Its own query so a notifications outage never
  // touches the rest of the rail; on error there is simply no badge (a wrong count is
  // worse than none). Polled, not pushed: notices are written by other people's actions.
  const unreadQuery = useQuery({
    queryKey: queryKeys.notifications.list(true),
    // `limit: 1` — the badge renders `unread`, a count the server computes on its own; the
    // rows came along for nothing, 50 of them per poll per signed-in user.
    queryFn: () => notificationsApi.list(true, 1),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
  const unread = unreadQuery.isError ? 0 : (unreadQuery.data?.unread ?? 0)

  // The signed-in person for the rail's avatar menu. This is the ONLY place the shell's
  // identity comes from: SideNav and AppShell stay user-blind and take it as a prop.
  //
  // It exists because sign-out had nowhere to live in the chrome. The only way out of the
  // app was Configuración → Mi perfil → scroll to the bottom of Seguridad, and nothing in
  // the rail represented the user at all — so an operator asked whether the app even had
  // a sign-out. The avatar in a corner is the first place anyone looks.
  //
  // `me` is null until /auth/me resolves, and while it is the menu is simply absent rather
  // than rendering a skeleton identity: an avatar with empty initials next to "Cerrar
  // sesión" invites a click on a session that is not established yet.
  const { me } = useAuth()
  const signOut = useSignOut()
  const shellUser = useMemo<NavUser | undefined>(() => {
    if (!me) return undefined
    const name = [me.firstName, me.lastName].filter(Boolean).join(' ')
    return {
      name: name || me.email,
      // First letters of the given and family name. Falls back to the email's first
      // character so the avatar is never blank for a user with no name on record.
      initials:
        [me.firstName, me.lastName]
          .filter(Boolean)
          .map((part) => part[0]?.toUpperCase() ?? '')
          .join('') || me.email[0]?.toUpperCase() || '?',
      detail: me.email,
      // Deep-links straight to the section, which every role can see — Mi perfil is the
      // one settings section an Equipo member reaches. Landing on /settings alone would
      // open "Espacio de trabajo" for an owner and make the person hunt for their own.
      profileHref: '/settings?section=profile',
      onSignOut: signOut,
    }
  }, [me, signOut])

  const visibleFooterNavItems = useMemo(
    () =>
      footerNavItems
        .filter((item) => canAccessPath(role, item.href, permissions))
        .map((item) =>
          item.href === '/notificaciones' && unread > 0 ? { ...item, badge: unread } : item,
        ),
    [role, permissions, unread],
  )

  // "Nuevo" launcher actions. Each navigates to the owning route and signals the
  // create flow via a query param the destination page reads on mount: Clientes
  // and Equipo open their standalone "new" dialog; Operación mensual opens a row
  // picker (cobro = client payment, pago = team payout) since its create flows are
  // row-scoped. Labels are product copy (Spanish); icons come from the registry.
  // The employee gets its own self-create set: the four work-tracking actions,
  // each deep-linking to /team?new=<token> which opens the matching self-dialog
  // for the signed-in member (consumed in team-page.tsx). Owner/admin operations
  // (create client/member, register cobro/pago) are disjoint from those tokens.
  // No "Cargar producción" for the employee: creating one is an owner/admin write, and
  // the dialog it opened could only end in a 403.
  const newActions = useMemo<NewAction[]>(
    () =>
      role === 'employee'
        ? [
            { label: 'Cargar horas', icon: ICON.logHours, onSelect: () => navigate('/team?new=hours') },
            { label: 'Cargar viático', icon: ICON.expense, onSelect: () => navigate('/team?new=expense') },
            { label: 'Cargar extra', icon: ICON.addExtraWork, onSelect: () => navigate('/team?new=extra') },
          ]
        : [
            { label: 'Nuevo cliente', icon: ICON.clientCreated, onSelect: () => navigate('/clients?new=1') },
            {
              label: 'Nuevo miembro del equipo',
              icon: ICON.teamMemberCreated,
              onSelect: () => navigate('/team?new=1'),
            },
            {
              label: 'Registrar cobro',
              icon: ICON.payment,
              onSelect: () => navigate('/operacion-mensual?new=cobro'),
            },
            {
              label: 'Registrar pago al equipo',
              icon: ICON.payment,
              onSelect: () => navigate('/operacion-mensual?new=pago'),
            },
          ],
    [navigate, role],
  )

  return (
    <DaytimeProvider>
      <AppShell
        navItems={visibleNavItems}
        footerNavItems={visibleFooterNavItems}
        activePath={pathname}
        pageTitle={pageTitle ?? undefined}
        newActions={newActions}
        user={shellUser}
      >
        <Outlet />
      </AppShell>

      <Toaster />
      {import.meta.env.DEV ? <DevControls /> : null}
    </DaytimeProvider>
  )
}

/* Dev-only floating controls (active role + color theme), clustered bottom-right.
   Styled with semantic tokens only; layout via Tailwind primitives. */
function DevControls() {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2">
      <RoleSwitcher />
      <ThemeToggle />
    </div>
  )
}

/* Switches the active role via a dropdown of the three roles (Dueño / Admin /
   Equipo). The seam for role-aware perspectives: switches the dashboard variant,
   the visible nav + routes, and each page's in-role view. The active role carries
   the check; picking another sets it. */
function RoleSwitcher() {
  const { role, setRole } = useRole()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Cambiar rol activo"
        className="rounded-container border border-alpha-subtle bg-surface-flat px-3 py-2 type-button fg-default shadow-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
      >
        Rol: {ROLE_LABEL[role]}
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" className="min-w-40">
        {ROLES.map((option) => (
          <DropdownMenuCheckboxItem
            key={option}
            checked={role === option}
            onCheckedChange={() => setRole(option)}
          >
            {ROLE_LABEL[option]}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/* Dev-only control to exercise light <-> dark switching. */
function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label="Toggle Color Theme"
      className="rounded-container border border-alpha-subtle bg-surface-flat px-3 py-2 type-button fg-default shadow-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
    >
      {theme === 'light' ? 'Dark mode' : 'Light mode'}
    </button>
  )
}

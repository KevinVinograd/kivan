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

export default function App() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { role, permissions } = useRole()
  const pageTitle = usePageTitle()

  const visibleNavItems = useMemo<NavEntry[]>(() => {
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
  const unreadQuery = useQuery({
    queryKey: queryKeys.notifications.list(true),
    queryFn: () => notificationsApi.list(true, 1),
    staleTime: 30_000,
    refetchInterval: 60_000,
  })
  const unread = unreadQuery.isError ? 0 : (unreadQuery.data?.unread ?? 0)

  const { me } = useAuth()
  const signOut = useSignOut()
  const shellUser = useMemo<NavUser | undefined>(() => {
    if (!me) return undefined
    const name = [me.firstName, me.lastName].filter(Boolean).join(' ')
    return {
      name: name || me.email,
      initials:
        [me.firstName, me.lastName]
          .filter(Boolean)
          .map((part) => part[0]?.toUpperCase() ?? '')
          .join('') || me.email[0]?.toUpperCase() || '?',
      detail: me.email,
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

function DevControls() {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2">
      <RoleSwitcher />
      <ThemeToggle />
    </div>
  )
}

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

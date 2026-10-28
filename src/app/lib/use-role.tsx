import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { ROLE_CAPABILITIES, type Capability } from '@hold/shared'
import { useAuth } from './auth-store'

/**
 * Active product role. This is the seam future role-aware perspectives plug
 * into: which dashboard variant renders, which nav items and routes are visible,
 * and what each role sees inside every page. `owner` and `employee` have built
 * views; `admin` is an intermediate operator (operations yes, profitability /
 * banking no) and still falls back to a placeholder dashboard.
 */
export type Role = 'owner' | 'admin' | 'employee'

/** Switch order for the dev role-switcher pill (cycles in this sequence). */
export const ROLES: Role[] = ['owner', 'admin', 'employee']

/** Display label per role (Spanish product copy). */
export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Dueño',
  admin: 'Admin',
  employee: 'Equipo',
}

type RoleContextValue = {
  role: Role
  setRole: (role: Role) => void
  /** Advance to the next role in `ROLES` (wraps). Drives the floating pill. */
  cycleRole: () => void
  /** The session's effective capabilities (built-in role narrowed by any custom role). The
   *  money/PII visibility switches read this, so a custom role actually changes what's shown. */
  capabilities: Capability[]
  /** The custom role's grant keys, or null when governed by the built-in role. Drives nav +
   *  page visibility for a custom role (null = built-in role logic, unchanged). */
  permissions: string[] | null
  /** Whether the session may perform an action key. `true` for a built-in session (no custom
   *  role → the built-in role gates already decide); for a custom role, holds only its grants.
   *  Hides action affordances the custom role lacks; the backend enforces regardless. */
  canDo: (permission: string) => boolean
}

const RoleContext = createContext<RoleContextValue | null>(null)

/**
 * Exposes the active product role. The source of truth is the signed-in user's
 * role from `/auth/me` (via `useAuth`); this provider sits inside `RequireAuth`,
 * so a session is always resolved when it mounts. In dev builds only, the
 * floating switcher can override the role locally to preview each role's views
 * (never persisted, resets on reload); production always follows the session.
 */
export function RoleProvider({ children }: { children: ReactNode }) {
  const { me } = useAuth()
  const sessionRole: Role = me?.role ?? 'owner'
  const [devOverride, setDevOverride] = useState<Role | null>(null)
  const role: Role = import.meta.env.DEV && devOverride ? devOverride : sessionRole

  const setRole = useCallback((next: Role) => {
    if (import.meta.env.DEV) setDevOverride(next)
  }, [])

  const cycleRole = useCallback(() => {
    if (!import.meta.env.DEV) return
    setDevOverride((current) => {
      const base = current ?? sessionRole
      return ROLES[(ROLES.indexOf(base) + 1) % ROLES.length]
    })
  }, [sessionRole])

  // Effective capabilities: in dev the role pill previews a built-in role's set; otherwise
  // the session's resolved set from /auth/me, falling back to role-derived when a pre-engine
  // response omits it (never to empty, which would hide money from an owner).
  const capabilities = useMemo<Capability[]>(() => {
    if (import.meta.env.DEV && devOverride) return [...ROLE_CAPABILITIES[devOverride]]
    return me?.capabilities ?? [...ROLE_CAPABILITIES[sessionRole]]
  }, [devOverride, me?.capabilities, sessionRole])

  // Grant keys for a custom role, or null (built-in governs). The dev pill previews a built-in
  // role, so it forces null — nav/pages then follow the previewed role, not a stale grant set.
  const permissions = useMemo<string[] | null>(() => {
    if (import.meta.env.DEV && devOverride) return null
    return me?.permissions ?? null
  }, [devOverride, me?.permissions])

  const canDo = useCallback(
    (permission: string) => permissions === null || permissions.includes(permission),
    [permissions],
  )

  const value = useMemo<RoleContextValue>(
    () => ({ role, setRole, cycleRole, capabilities, permissions, canDo }),
    [role, setRole, cycleRole, capabilities, permissions, canDo],
  )

  return <RoleContext.Provider value={value}>{children}</RoleContext.Provider>
}

export function useRole(): RoleContextValue {
  const value = useContext(RoleContext)
  if (!value) throw new Error('useRole must be used within a RoleProvider')
  return value
}

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'
import { ROLE_CAPABILITIES, type Capability } from '@hold/shared'
import { useAuth } from './auth-store'

export type Role = 'owner' | 'admin' | 'employee'

export const ROLES: Role[] = ['owner', 'admin', 'employee']

export const ROLE_LABEL: Record<Role, string> = {
  owner: 'Dueño',
  admin: 'Admin',
  employee: 'Equipo',
}

type RoleContextValue = {
  role: Role
  setRole: (role: Role) => void
  cycleRole: () => void
  capabilities: Capability[]
  permissions: string[] | null
  canDo: (permission: string) => boolean
}

const RoleContext = createContext<RoleContextValue | null>(null)

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

  const capabilities = useMemo<Capability[]>(() => {
    if (import.meta.env.DEV && devOverride) return [...ROLE_CAPABILITIES[devOverride]]
    return me?.capabilities ?? [...ROLE_CAPABILITIES[sessionRole]]
  }, [devOverride, me?.capabilities, sessionRole])

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

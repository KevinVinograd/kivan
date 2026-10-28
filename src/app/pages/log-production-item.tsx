import { DropdownMenuItem } from '@/app/components/components'
import { ICON } from '@/app/lib/icon-registry'
import { useRole } from '@/app/lib/use-role'

/**
 * Whether this session holds a production grant — the API's own rule (`productionAccess`),
 * mirrored. Owner/admin: `canDo`, i.e. allowed unless a custom role withholds it. An
 * employee: only with the grant EXPLICITLY on their custom role — the communication leads
 * HOLD wants loading and approving productions (2026-10-19). A system employee carries no
 * grant list (`permissions: null`, which `canDo` reads as "allowed"), so `canDo` alone would
 * let every employee through.
 */
function useProductionGrant(permission: string): boolean {
  const { role, canDo, permissions } = useRole()
  if (role === 'employee') return permissions?.includes(permission) ?? false
  return canDo(permission)
}

export function useCanCreateProduction(): boolean {
  return useProductionGrant('production.create')
}

/** Approve a production — the lead's "se hizo", after which it is billed and paid. */
export function useCanApproveProduction(): boolean {
  return useProductionGrant('production.approve')
}

/**
 * The "Cargar producción" entry of every per-person "Cargar" menu, shown only to someone
 * who may create productions. The menus also render for an employee logging their own
 * work, and there the entry used to open a form whose save always failed with a 403. One
 * component, so the menus that offer it cannot drift apart on who sees it.
 */
export function LogProductionItem({ onSelect }: { onSelect: () => void }) {
  if (!useCanCreateProduction()) return null
  return (
    <DropdownMenuItem onSelect={onSelect}>
      <ICON.production aria-hidden />
      Cargar producción
    </DropdownMenuItem>
  )
}

/**
 * "Ver producciones" in an employee's per-client menu: the lead's way into a client's
 * productions — history, approval and loading — from a roster that has no client view.
 * Shown only to someone holding a production grant.
 */
export function ViewProductionsItem({ onSelect }: { onSelect: () => void }) {
  const canCreate = useCanCreateProduction()
  const canApprove = useCanApproveProduction()
  if (!canCreate && !canApprove) return null
  return (
    <DropdownMenuItem onSelect={onSelect}>
      <ICON.production aria-hidden />
      Ver producciones
    </DropdownMenuItem>
  )
}


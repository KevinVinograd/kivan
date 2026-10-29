import { DropdownMenuItem } from '@/app/components/components'
import { ICON } from '@/app/lib/icon-registry'
import { useRole } from '@/app/lib/use-role'

function useProductionGrant(permission: string): boolean {
  const { role, canDo, permissions } = useRole()
  if (role === 'employee') return permissions?.includes(permission) ?? false
  return canDo(permission)
}

export function useCanCreateProduction(): boolean {
  return useProductionGrant('production.create')
}

export function useCanApproveProduction(): boolean {
  return useProductionGrant('production.approve')
}

export function LogProductionItem({ onSelect }: { onSelect: () => void }) {
  if (!useCanCreateProduction()) return null
  return (
    <DropdownMenuItem onSelect={onSelect}>
      <ICON.production aria-hidden />
      Cargar producción
    </DropdownMenuItem>
  )
}

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


import { useId } from 'react'

import { Badge, Switch, Tabs, TabsList, TabsTrigger } from '@/app/components/components'
import { AFFORDANCE } from '@/app/lib/icon-registry'
import {
  ACCESS_LEVELS,
  grantedByLevel,
  type AccessLevel,
  type AreaDef,
  type Enforcement,
  type PermissionDef,
} from './settings-roles-data'

function EnforcementChip({ enforcement }: { enforcement: Enforcement }) {
  if (enforcement === 'enforced') return null
  return enforcement === 'display_only' ? (
    <Badge variant="warning" shape="pill">
      Solo lo oculta
    </Badge>
  ) : (
    <Badge variant="outline" shape="pill">
      Todavía sin efecto
    </Badge>
  )
}

function PermissionRow({
  permission,
  checked,
  onToggle,
}: {
  permission: PermissionDef
  checked: boolean
  onToggle: (next: boolean) => void
}) {
  const id = useId()
  const inert = permission.enforcement === 'inert'

  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <label htmlFor={id} className="flex min-w-0 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2">
          <span className="type-body-2 fg-default">{permission.label}</span>
          <EnforcementChip enforcement={permission.enforcement} />
        </span>
        <span className="type-caption fg-subtle">{permission.help}</span>
        {permission.blockedBy ? (
          <span className="type-caption fg-warning">{permission.blockedBy}</span>
        ) : null}
      </label>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onToggle}
        disabled={inert}
        className="mt-0.5 shrink-0"
      />
    </div>
  )
}

export function AreaRow({
  area,
  level,
  expanded,
  overrides,
  onLevelChange,
  onToggleExpanded,
  onTogglePermission,
}: {
  area: AreaDef
  level: AccessLevel
  expanded: boolean
  overrides: Record<string, boolean>
  onLevelChange: (next: AccessLevel) => void
  onToggleExpanded: () => void
  onTogglePermission: (key: string, next: boolean) => void
}) {
  const Chevron = expanded ? AFFORDANCE.collapseValue : AFFORDANCE.expand
  const isCustom = area.permissions.some((permission) => permission.key in overrides)

  const isGranted = (permission: PermissionDef): boolean =>
    permission.key in overrides ? overrides[permission.key] : grantedByLevel(permission, level)

  const grantedCount = area.permissions.filter(isGranted).length

  return (
    <div className="flex flex-col gap-3 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          className="flex min-w-0 items-center gap-2 text-left"
        >
          <Chevron className="size-4 shrink-0 fg-subtle" aria-hidden />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="flex flex-wrap items-center gap-2">
              <span className="type-body-2 fg-default">{area.label}</span>
              {isCustom ? (
                <Badge variant="outline" shape="pill">
                  {`Personalizado, ${grantedCount} de ${area.permissions.length}`}
                </Badge>
              ) : null}
            </span>
            <span className="type-caption fg-subtle">{area.description}</span>
          </span>
        </button>

        <Tabs
          value={isCustom ? '' : level}
          onValueChange={(next) => onLevelChange(next as AccessLevel)}
        >
          <TabsList>
            {ACCESS_LEVELS.map((stop) => (
              <TabsTrigger key={stop.id} value={stop.id}>
                {stop.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      {expanded ? (
        <div className="flex flex-col pl-6">
          {area.permissions.map((permission) => (
            <PermissionRow
              key={permission.key}
              permission={permission}
              checked={isGranted(permission)}
              onToggle={(next) => onTogglePermission(permission.key, next)}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

import { Input, Tabs, TabsContent, TabsList, TabsTrigger, Textarea } from '@/app/components/components'
import { Field, ToggleRow } from './settings-fields'
import { AreaRow } from './settings-roles-area-row'
import { AREAS, MONEY_SWITCHES, enforcementTally, type AccessLevel } from './settings-roles-data'

export type RoleDraft = {
  name: string
  description: string
  isSystem: boolean
  access: Record<string, AccessLevel>
  money: Record<string, boolean>
}

export function RoleEditor({
  role,
  expandedArea,
  overrides,
  onChange,
  onAreaLevelChange,
  onToggleArea,
  onTogglePermission,
}: {
  role: RoleDraft
  expandedArea: string | null
  overrides: Record<string, boolean>
  onChange: (patch: Partial<RoleDraft>) => void
  onAreaLevelChange: (areaId: string, next: AccessLevel) => void
  onToggleArea: (areaId: string) => void
  onTogglePermission: (key: string, next: boolean) => void
}) {
  const tally = enforcementTally()

  return (
    <Tabs defaultValue="identity">
      <TabsList>
        <TabsTrigger value="identity">Identidad</TabsTrigger>
        <TabsTrigger value="money">Datos sensibles</TabsTrigger>
        <TabsTrigger value="access">Acceso por área</TabsTrigger>
      </TabsList>

      <TabsContent value="identity" className="flex flex-col gap-4">
        <Field label="Nombre">
          <Input
            value={role.name}
            disabled={role.isSystem}
            onChange={(event) => onChange({ name: event.target.value })}
            placeholder="Por ejemplo: Contadora"
          />
        </Field>
        <Field label="Para qué sirve">
          <Textarea
            value={role.description}
            disabled={role.isSystem}
            onChange={(event) => onChange({ description: event.target.value })}
            placeholder="Una línea que explique qué hace esta persona en el estudio."
          />
        </Field>
      </TabsContent>

      <TabsContent value="money" className="flex flex-col gap-4">
        <p className="type-caption fg-subtle">
          Atraviesan todo el producto, así que se deciden una vez y valen en todas las pantallas.
        </p>
        {MONEY_SWITCHES.map((permission) => (
          <ToggleRow
            key={permission.key}
            label={permission.label}
            description={permission.help}
            checked={role.money[permission.key] ?? false}
            disabled={role.isSystem}
            onCheckedChange={(checked) =>
              onChange({ money: { ...role.money, [permission.key]: checked } })
            }
          />
        ))}
      </TabsContent>

      <TabsContent value="access" className="flex flex-col gap-2">
        <p className="type-caption fg-subtle">
          {`Elegí un nivel por área, o abrí una para decidir permiso por permiso. De los ${tally.total} permisos, ${tally.enforced} los hace cumplir el servidor, ${tally.displayOnly} solo esconden la opción en pantalla y ${tally.inert} todavía no tienen efecto.`}
        </p>
        <div className="flex flex-col divide-y divide-alpha-subtle">
          {AREAS.map((area) => (
            <AreaRow
              key={area.id}
              area={area}
              level={role.access[area.id] ?? 'none'}
              expanded={expandedArea === area.id}
              overrides={overrides}
              onLevelChange={(next: AccessLevel) => onAreaLevelChange(area.id, next)}
              onToggleExpanded={() => onToggleArea(area.id)}
              onTogglePermission={onTogglePermission}
            />
          ))}
        </div>
      </TabsContent>
    </Tabs>
  )
}

import { Input, Tabs, TabsContent, TabsList, TabsTrigger, Textarea } from '@/app/components/components'
import { Field, ToggleRow } from './settings-fields'
import { AreaRow } from './settings-roles-area-row'
import { AREAS, MONEY_SWITCHES, enforcementTally, type AccessLevel } from './settings-roles-data'

/**
 * Only what the editor actually renders. Deliberately NOT the stored `RoleDto`:
 * the dialog edits a DRAFT, so the identity and version of the saved row are the
 * caller's business, not this component's.
 */
export type RoleDraft = {
  name: string
  description: string
  isSystem: boolean
  access: Record<string, AccessLevel>
  money: Record<string, boolean>
}

/**
 * The body of one role, split across three tabs: who it is, what money it sees,
 * and what it can reach.
 *
 * Deliberately NOT wrapped in `SettingGroup` cards. Inside a dialog the card
 * chrome is a third nested surface that buys nothing and costs width — the tab
 * strip already separates the groups, so the content gets the full dialog.
 *
 * Note the nested tablists: each area row carries its own four-stop control.
 * Radix scopes roving focus per `Tabs` root, so the outer strip and the inner
 * controls do not fight over arrow keys.
 *
 * Split out of `settings-roles.tsx` to keep both files under the 300-line limit
 *.
 */
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
  /** Owns the whole level change: sets the level, clears that area's manual
   *  overrides (picking a preset is a clean reset), and opens or closes the row. */
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

      {/* No helper copy here on purpose: the field labels and placeholders carry
          it, and the system-role caveat is already in the dialog description. */}
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

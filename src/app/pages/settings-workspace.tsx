import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@/app/components/components'
import { PanelContent, SectionHeader } from '@/app/components/templates'
import { ApiError } from '@/api/client'
import { workspaceApi } from '@/api/workspace'
import { LANES, LANE_PICKER_LABEL } from '@/lib/currency'
import { queryKeys } from '@/queries/keys'
import { Field, SettingGroup } from './settings-fields'

// Timezone is a free string server-side; the option VALUES are the IANA names the
// backend stores (its default is 'America/Argentina/Buenos_Aires'), so a saved value
// round-trips into the Select without a translation layer.
const TIMEZONES = [
  { value: 'America/Argentina/Buenos_Aires', label: 'Argentina (GMT-3)' },
  { value: 'America/Santiago', label: 'Chile (GMT-3)' },
  { value: 'America/Mexico_City', label: 'México (GMT-6)' },
  { value: 'Europe/Madrid', label: 'España (GMT+1)' },
]

// DERIVED, not hand-written. As a literal array this was the drift `@/lib/currency` exists
// to prevent: a lane added to the `Currency` enum compiled cleanly here while this Select
// went on offering two, so a workspace could never be defaulted to the new lane and the
// whole suite stayed green. `LANES` and `LANE_PICKER_LABEL` are both derived from an
// exhaustiveness-checked `Record<Currency, string>` in that leaf — `LANE_NOUN` for the one
// and `LANE_PICKER_LABEL` for the other, so a new lane is two entries there and none here.
const CURRENCIES = LANES.map((value) => ({ value, label: LANE_PICKER_LABEL[value] }))


/**
 * Espacio de trabajo — owner/admin section for the studio identity and the regional
 * defaults. Backed by the real `GET`/`PUT /workspace` endpoint: it loads the current
 * values and persists name / timezone / defaultCurrency (the fields the Workspace
 * model carries). Website and date-format were dropped — the model has no column for
 * them, so showing them would be a fake save.
 */
export function SettingsWorkspace() {
  const queryClient = useQueryClient()
  const workspaceQuery = useQuery({ queryKey: queryKeys.workspace.current, queryFn: workspaceApi.get })

  const [name, setName] = useState('')
  const [timezone, setTimezone] = useState(TIMEZONES[0].value)
  // `string`, not `Currency`: the value round-trips through `workspaceApi`, whose
  // `defaultCurrency` is a plain string, and the Select's `onValueChange` hands one back.
  // Narrowing here would only move the cast, not remove it. What guarantees the picker
  // offers every lane is `LANE_PICKER_LABEL` in `@/lib/currency`, which the compiler checks.
  const [currency, setCurrency] = useState<string>(CURRENCIES[0].value)

  // Seed the form from the server once it loads (and whenever it refetches).
  const loaded = workspaceQuery.data
  useEffect(() => {
    if (!loaded) return
    setName(loaded.name)
    setTimezone(loaded.timezone)
    setCurrency(loaded.defaultCurrency)
  }, [loaded])

  const saveMutation = useMutation({
    mutationFn: () =>
      workspaceApi.update({ name: name.trim(), timezone, defaultCurrency: currency }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspace.current })
      toast.success('Espacio de trabajo actualizado')
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'No se pudieron guardar los cambios'),
  })

  const disabled = workspaceQuery.isLoading || saveMutation.isPending || name.trim().length === 0

  return (
    <>
      <SectionHeader
        title="Espacio de trabajo"
        description="La identidad y los valores por defecto del estudio."
        actions={
          <Button
            variant="solid"
            color="primary"
            size="dense"
            disabled={disabled}
            onClick={() => saveMutation.mutate()}
          >
            <span className="sm:hidden">Guardar</span>
            <span className="hidden sm:block">Guardar cambios</span>
          </Button>
        }
      />
      <PanelContent layout="stacked">
        {workspaceQuery.isError ? (
          <p className="type-body-2 fg-danger">No pudimos cargar el espacio de trabajo.</p>
        ) : null}
        <SettingGroup title="Identidad del estudio">
          <Field label="Nombre del estudio">
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
        </SettingGroup>

        <SettingGroup title="Regional" description="Se aplica a fechas y montos en todo el producto.">
          <Field label="Zona horaria">
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger className="w-full" aria-label="Zona horaria">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIMEZONES.map((tz) => (
                  <SelectItem key={tz.value} value={tz.value}>
                    {tz.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Moneda">
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="w-full" aria-label="Moneda">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </SettingGroup>
      </PanelContent>
    </>
  )
}

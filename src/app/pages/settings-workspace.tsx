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

const TIMEZONES = [
  { value: 'America/Argentina/Buenos_Aires', label: 'Argentina (GMT-3)' },
  { value: 'America/Santiago', label: 'Chile (GMT-3)' },
  { value: 'America/Mexico_City', label: 'México (GMT-6)' },
  { value: 'Europe/Madrid', label: 'España (GMT+1)' },
]

const CURRENCIES = LANES.map((value) => ({ value, label: LANE_PICKER_LABEL[value] }))


export function SettingsWorkspace() {
  const queryClient = useQueryClient()
  const workspaceQuery = useQuery({ queryKey: queryKeys.workspace.current, queryFn: workspaceApi.get })

  const [name, setName] = useState('')
  const [timezone, setTimezone] = useState(TIMEZONES[0].value)
  const [currency, setCurrency] = useState<string>(CURRENCIES[0].value)

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

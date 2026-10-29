import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import { ApiError } from '@/api/client'
import { workspaceApi } from '@/api/workspace'
import { queryKeys } from '@/queries/keys'
import { useMonthlyRules } from './monthly-rules-data'

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
import { Field, SettingGroup, ToggleRow } from './settings-fields'

const CLOSE_DAYS = Array.from({ length: 28 }, (_, i) => String(i + 1))

function EditableList({
  items,
  onChange,
  addLabel,
}: {
  items: string[]
  onChange: (items: string[]) => void
  addLabel: string
}) {
  const [draft, setDraft] = useState('')

  function add() {
    const value = draft.trim()
    if (!value || items.includes(value)) return
    onChange([...items, value])
    setDraft('')
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {items.length > 0 ? (
          items.map((item) => (
            <div
              key={item}
              className="flex items-center justify-between gap-2 rounded-control border border-alpha-subtle px-3 py-1.5"
            >
              <span className="type-body-2 fg-default">{item}</span>
              <Button
                variant="transparent"
                color="primary"
                size="dense"
                onClick={() => onChange(items.filter((value) => value !== item))}
              >
                Quitar
              </Button>
            </div>
          ))
        ) : (
          <span className="type-caption fg-subtle">Todavía no hay opciones.</span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          placeholder={addLabel}
        />
        <Button variant="outlined" color="primary" size="dense" onClick={add} disabled={!draft.trim()}>
          Agregar
        </Button>
      </div>
    </div>
  )
}

export function SettingsOperation() {
  const queryClient = useQueryClient()
  const { rules, isLoading, isError } = useMonthlyRules()

  const [closeDay, setCloseDay] = useState(String(rules.closeDay))
  const [closeReminder, setCloseReminder] = useState(rules.closeReminder)
  const [reminderDays, setReminderDays] = useState(String(rules.reminderDays))
  const [autoReminders, setAutoReminders] = useState(rules.autoReminders)
  const [payDay, setPayDay] = useState(String(rules.payDay))
  const [requireApproval, setRequireApproval] = useState(rules.requireApproval)
  const [expenseCategories, setExpenseCategories] = useState(rules.expenseCategories)
  const [productionTypes, setProductionTypes] = useState(rules.productionTypes)

  const loadedKey = JSON.stringify(rules)
  useEffect(() => {
    setCloseDay(String(rules.closeDay))
    setCloseReminder(rules.closeReminder)
    setReminderDays(String(rules.reminderDays))
    setAutoReminders(rules.autoReminders)
    setPayDay(String(rules.payDay))
    setRequireApproval(rules.requireApproval)
    setExpenseCategories(rules.expenseCategories)
    setProductionTypes(rules.productionTypes)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the serialized document
  }, [loadedKey])

  const saveMutation = useMutation({
    mutationFn: () =>
      workspaceApi.update({
        monthlyRules: {
          closeDay: Number(closeDay),
          closeReminder,
          reminderDays: Number(reminderDays),
          autoReminders,
          payDay: Number(payDay),
          requireApproval,
          expenseCategories,
          productionTypes,
        },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.workspace.current })
      toast.success('Reglas de operación actualizadas')
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'No se pudieron guardar las reglas'),
  })

  return (
    <>
      <SectionHeader
        title="Operación mensual"
        description="Cómo arranca y se cierra cada mes de operación."
        actions={
          <Button
            variant="solid"
            color="primary"
            size="dense"
            disabled={isLoading || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            <span className="sm:hidden">Guardar</span>
            <span className="hidden sm:block">Guardar cambios</span>
          </Button>
        }
      />
      <PanelContent layout="stacked">
        {isError ? (
          <p className="type-body-2 fg-danger">
            No pudimos cargar las reglas guardadas. Estás viendo los valores por defecto.
          </p>
        ) : null}
        <SettingGroup title="Cierre del mes">
          <Field label="Día de cierre">
            <Select value={closeDay} onValueChange={setCloseDay}>
              <SelectTrigger className="w-full" aria-label="Día de cierre">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLOSE_DAYS.map((day) => (
                  <SelectItem key={day} value={day}>
                    Día {day}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <ToggleRow
            label="Recordarme antes de cerrar"
            description="Un aviso unos días antes del cierre del mes."
            checked={closeReminder}
            onCheckedChange={setCloseReminder}
          />
        </SettingGroup>

        <SettingGroup title="Recordatorios de cobro">
          <Field label="Días antes del vencimiento">
            <Input
              type="number"
              min={0}
              value={reminderDays}
              onChange={(e) => setReminderDays(e.target.value)}
            />
          </Field>
          <ToggleRow
            label="Enviar recordatorios automáticos"
            description="Avisa al cliente cuando se acerca el vencimiento."
            checked={autoReminders}
            onCheckedChange={setAutoReminders}
          />
        </SettingGroup>

        <SettingGroup title="Categorías de gastos">
          <EditableList
            items={expenseCategories}
            onChange={setExpenseCategories}
            addLabel="Nueva categoría"
          />
        </SettingGroup>

        <SettingGroup title="Tipos de producción">
          <EditableList
            items={productionTypes}
            onChange={setProductionTypes}
            addLabel="Nuevo tipo"
          />
        </SettingGroup>

        <SettingGroup title="Pagos del equipo">
          <Field label="Día de pago">
            <Select value={payDay} onValueChange={setPayDay}>
              <SelectTrigger className="w-full" aria-label="Día de pago">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLOSE_DAYS.slice(0, 15).map((day) => (
                  <SelectItem key={day} value={day}>
                    Día {day}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <ToggleRow
            label="Requerir aprobación antes de pagar"
            description="Cada pago del equipo necesita una aprobación previa."
            checked={requireApproval}
            onCheckedChange={setRequireApproval}
          />
        </SettingGroup>
      </PanelContent>
    </>
  )
}

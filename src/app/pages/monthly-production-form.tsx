import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { ApiError } from '@/api/client'
import { todayIso } from '@/app/lib/iso-date'

import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toast,
} from '@/app/components/components'
import { DatePicker } from '@/app/components/patterns'
import { clientsApi } from '@/api/clients'
import { monthlyApi } from '@/api/monthly'
import { queryKeys } from '@/queries/keys'
import { useRole } from '@/app/lib/use-role'
import { hasCapability } from '@hold/shared'
import { SearchSelect } from './assignment-pickers'
import { formatCurrency } from './monthly-operation-format'
import { useMonthlyRules } from './monthly-rules-data'
import { ProductionServiceField } from './monthly-production-service-field'
import { useClientServiceLines } from './client-month-data'
import { includedHoursLabel } from './clients-service-lines-format'
import { useTeamData, type TeamDataContextValue } from './team-data'
import type { ProductionBillable, ProductionRecord } from './monthly-operation-mock-data'
import type { ProductionInput } from './monthly-operation-data'

const BILLABLE_OPTIONS: { value: ProductionBillable; label: string }[] = [
  { value: 'internal', label: 'Interna' },
  { value: 'billable', label: 'Facturable' },
  { value: 'both', label: 'Mixta' },
]

function emptyProduction(): ProductionInput {
  return {
    date: '',
    clientId: '',
    clientName: '',
    title: '',
    type: '',
    responsible: '',
    participants: [],
    hours: 0,
    viatics: 0,
    totalCost: 0,
    billAmount: 0,
    billable: null,
    notes: '',
    clientServiceId: null,
    accountManagerId: null,
    creatorId: null,
    costEdited: false,
    viaticsPaidAt: '',
    receipt: '',
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="type-caption fg-subtle">{label}</span>
      {children}
    </label>
  )
}

function defaultAccountManager(td: TeamDataContextValue, clientId: string): string | null {
  const managers = td
    .assignmentsForClient(clientId, { activeOnly: true })
    .filter((a) => a.roleOnClient === 'Comunicación')
  return managers.length === 1 ? (managers[0]?.teamMemberId ?? null) : null
}

function splitHours(hours: number): { h: number; m: number } {
  const h = Math.floor(hours)
  return { h, m: Math.round((hours - h) * 60) }
}

export function ProductionForm({
  onClose,
  onSubmit,
  initial,
  prefill,
  title = 'Cargar producción',
  submitLabel = 'Cargar producción',
}: {
  onClose: () => void
  onSubmit: (input: ProductionInput) => Promise<boolean>
  initial?: ProductionInput
  prefill?: Partial<ProductionInput>
  title?: string
  submitLabel?: string
}) {
  const td = useTeamData()
  const { role, capabilities } = useRole()
  const showBilling = role !== 'employee'
  const showCost = showBilling && hasCapability(capabilities, 'teamCost')
  const [values, setValues] = useState<ProductionInput>(() => {
    if (initial) return initial
    const start = { ...emptyProduction(), ...prefill }
    return start.clientId && !start.accountManagerId
      ? { ...start, accountManagerId: defaultAccountManager(td, start.clientId) }
      : start
  })
  const [submitting, setSubmitting] = useState(false)
  const { rules, isError: rulesFailed } = useMonthlyRules()
  const typeOptions =
    values.type && !rules.productionTypes.includes(values.type)
      ? [values.type, ...rules.productionTypes]
      : rules.productionTypes
  const [clients, setClients] = useState<{ id: string; name: string; currency: string }[]>([])
  const [loadFailed, setLoadFailed] = useState(false)
  useEffect(() => {
    let cancelled = false
    clientsApi
      .list({ limit: 100, offset: 0 })
      .then((res) => {
        if (!cancelled) {
          setClients(res.items.map((c) => ({ id: c.id, name: c.name, currency: c.currency })))
          setLoadFailed(false)
        }
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [])
  const clientOptions =
    values.clientId && !clients.some((c) => c.id === values.clientId)
      ? [{ id: values.clientId, name: values.clientName || 'Cliente actual', currency: '' }, ...clients]
      : clients
  const billCurrency = clientOptions.find((c) => c.id === values.clientId)?.currency ?? ''

  const leadPeople = useQuery({
    queryKey: queryKeys.team.productionPeople(),
    queryFn: () => monthlyApi.listProductionPeople(),
    enabled: role === 'employee',
  })
  const people =
    role === 'employee'
      ? (leadPeople.data ?? [])
      : td.members
          .filter((m) => m.status !== 'inactive' || m.id === values.creatorId || m.id === values.accountManagerId)
          .map((m) => ({ id: m.id, name: m.name }))
          .sort((a, b) => a.name.localeCompare(b.name, 'es'))
  const creator = td.members.find((m) => m.id === values.creatorId)
  const rate = creator?.compensation.hourlyRate
  const pricedCost = rate && values.hours > 0 ? Math.round(rate * values.hours) : null
  const shownCost = values.costEdited ? values.totalCost : (pricedCost ?? values.totalCost)
  const duration = splitHours(values.hours)

  function update<K extends keyof ProductionInput>(key: K, value: ProductionInput[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }
  function pickClient(id: string) {
    const option = clientOptions.find((c) => c.id === id)
    const manager = defaultAccountManager(td, id)
    setValues((prev) => ({
      ...prev,
      clientId: id,
      clientName: option?.name ?? '',
      clientServiceId: id === prev.clientId ? prev.clientServiceId : null,
      accountManagerId: prev.accountManagerId ?? manager,
    }))
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-xl">
        <form
          className="flex flex-col gap-6"
          onSubmit={async (event) => {
            event.preventDefault()
            if (submitting) return
            setSubmitting(true)
            if (!(await onSubmit(values))) setSubmitting(false)
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>Registrá una producción con sus horas y viáticos.</DialogDescription>
          </DialogHeader>

          {td.isError ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="type-body-2 fg-danger">No se pudo cargar el equipo.</span>
              <Button variant="transparent" color="primary" size="dense" onClick={() => td.refetch()}>
                Reintentar
              </Button>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Fecha">
              <DatePicker
                value={values.date}
                onChange={(value) => update('date', value)}
                required
                aria-label="Fecha de la producción"
              />
            </Field>
            <Field label="Cliente">
              <SearchSelect
                label="Cliente"
                options={clientOptions}
                value={values.clientId}
                onChange={pickClient}
                placeholder={loadFailed ? 'No se pudo cargar' : clientOptions.length ? 'Buscá el cliente' : 'Sin clientes'}
                emptyText="No hay clientes con ese nombre"
              />
              {loadFailed ? (
                <span className="type-caption fg-danger">
                  No se pudieron cargar los clientes, volvé a abrir el formulario
                </span>
              ) : null}
            </Field>
            <Field label="Tipo">
              <Select value={values.type} onValueChange={(value) => update('type', value)}>
                <SelectTrigger className="w-full" aria-label="Tipo de producción">
                  <SelectValue placeholder="Elegí el tipo" />
                </SelectTrigger>
                <SelectContent>
                  {typeOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {rulesFailed ? (
                <span className="type-caption fg-subtle">
                  No pudimos cargar los tipos del estudio; estás viendo los de por defecto.
                </span>
              ) : null}
            </Field>
            <Field label="Tema">
              <Input
                value={values.title}
                onChange={(event) => update('title', event.target.value)}
                placeholder="Opcional: si lo dejás vacío, queda el tipo"
              />
            </Field>
            <Field label="Account manager">
              <SearchSelect
                label="Account manager"
                options={people}
                value={values.accountManagerId ?? ''}
                onChange={(id) => update('accountManagerId', id)}
                placeholder="Buscá a la persona"
                emptyText="No hay nadie con ese nombre"
              />
            </Field>
            <Field label="Content creator">
              <SearchSelect
                label="Content creator"
                options={people}
                value={values.creatorId ?? ''}
                onChange={(id) => update('creatorId', id)}
                placeholder="Buscá a la persona"
                emptyText="No hay nadie con ese nombre"
              />
            </Field>
            <Field label="Duración">
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  aria-label="Horas"
                  value={duration.h}
                  onChange={(event) => update('hours', (Number(event.target.value) || 0) + duration.m / 60)}
                />
                <span className="type-body-2 fg-subtle">h</span>
                <Input
                  type="number"
                  min={0}
                  max={59}
                  step={5}
                  aria-label="Minutos"
                  value={duration.m}
                  onChange={(event) =>
                    update('hours', duration.h + Math.min(59, Number(event.target.value) || 0) / 60)
                  }
                />
                <span className="type-body-2 fg-subtle">min</span>
              </div>
            </Field>
            {showCost ? (
              <Field label="Costo del content creator (ARS)">
                <Input
                  type="number"
                  min={0}
                  value={shownCost || ''}
                  placeholder="Se calcula con lo que le pagamos por hora"
                  onChange={(event) =>
                    setValues((prev) => ({
                      ...prev,
                      totalCost: Number(event.target.value) || 0,
                      costEdited: event.target.value !== '',
                    }))
                  }
                />
                {!values.costEdited && pricedCost != null ? (
                  <span className="type-caption fg-subtle">
                    {`Horas × ${formatCurrency(rate ?? 0)} que le pagamos por hora`}
                  </span>
                ) : null}
                {!values.costEdited && creator && !rate && values.hours > 0 ? (
                  <span className="type-caption fg-warning">
                    {`No cargaste cuánto le pagamos por hora a ${creator.name}: el costo queda en $0. Cargalo en Equipo → Editar persona, o escribí el monto.`}
                  </span>
                ) : null}
              </Field>
            ) : null}
            <Field label="Viáticos (ARS)">
              <Input
                type="number"
                min={0}
                value={values.viatics || ''}
                placeholder="0"
                onChange={(event) => update('viatics', Number(event.target.value) || 0)}
              />
            </Field>
            <Field label="Viático pagado el">
              <DatePicker
                value={values.viaticsPaidAt}
                onChange={(value) => update('viaticsPaidAt', value)}
                disabled={values.viatics <= 0}
                placeholder="Sin pagar"
                aria-label="Fecha de pago del viático"
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Comprobante">
                <Input
                  value={values.receipt}
                  onChange={(event) => update('receipt', event.target.value)}
                  placeholder="Link de Drive o nombre del archivo"
                />
              </Field>
            </div>
            {showBilling ? (
              <>
                <Field label="Facturable aparte">
                  <Select
                    value={values.billable ?? ''}
                    onValueChange={(value) => update('billable', value as ProductionBillable)}
                  >
                    <SelectTrigger className="w-full" aria-label="Facturable aparte">
                      <SelectValue placeholder="Sin definir" />
                    </SelectTrigger>
                    <SelectContent>
                      {BILLABLE_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <ProductionServiceField
                  clientId={values.clientId}
                  value={values.clientServiceId}
                  onChange={(line) =>
                    setValues((prev) =>
                      line
                        ? {
                            ...prev,
                            clientServiceId: line.id,
                            billable: prev.billable === 'both' ? 'both' : 'billable',
                            billAmount: Number(line.priceMinor) / 100,
                          }
                        : { ...prev, clientServiceId: null },
                    )
                  }
                />
                <BillAmountField
                  clientId={values.clientId}
                  clientServiceId={values.clientServiceId}
                  hours={values.hours}
                  currency={billCurrency}
                  value={values.billAmount}
                  onChange={(amount) => update('billAmount', amount)}
                />
              </>
            ) : null}
          </div>

          <Field label="Notas">
            <Textarea
              value={values.notes}
              onChange={(event) => update('notes', event.target.value)}
              placeholder="Por ejemplo, quién pagó el viático"
              className="min-h-20"
            />
          </Field>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outlined" color="primary">
                Cancelar
              </Button>
            </DialogClose>
            <Button
              type="submit"
              variant="solid"
              color="primary"
              disabled={
                !values.clientId || !values.date || !values.type || td.isError || submitting
              }
            >
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function toInput(production: ProductionRecord): ProductionInput {
  return {
    date: production.date,
    clientId: production.clientId,
    clientName: production.clientName,
    title: production.title,
    type: production.type,
    responsible: production.responsible,
    participants: production.participants,
    hours: production.hours,
    viatics: production.viatics,
    totalCost: production.totalCost,
    billAmount: production.billAmount ?? 0,
    billable: production.billable,
    notes: production.notes ?? '',
    clientServiceId: production.clientServiceId ?? null,
    accountManagerId: production.accountManagerId ?? null,
    creatorId: production.creatorId ?? null,
    costEdited: false,
    viaticsPaidAt: production.viaticsPaidAt ?? '',
    receipt: production.receipt ?? '',
  }
}

export function LogProductionForm({
  prefill,
  onClose,
}: {
  prefill: Partial<ProductionInput>
  onClose: () => void
}) {
  const td = useTeamData()
  const queryClient = useQueryClient()
  return (
    <ProductionForm
      prefill={{ date: todayIso(), ...prefill }}
      onClose={onClose}
      onSubmit={async (input) => {
        try {
          await td.addProduction(input)
        } catch (error) {
          toast.error('No se pudo cargar la producción', {
            description:
              error instanceof ApiError && error.status === 409
                ? 'El mes está cerrado: reabrilo para cargarla.'
                : error instanceof ApiError && error.status === 403
                  ? 'No tenés permiso para cargar producciones.'
                  : 'Probá de nuevo en un momento.',
          })
          return false
        }
        toast.success('Producción cargada')
        void queryClient.invalidateQueries({ queryKey: queryKeys.clients.productionsAll() })
        onClose()
        return true
      }}
    />
  )
}

function BillAmountField({
  clientId,
  clientServiceId,
  hours,
  currency,
  value,
  onChange,
}: {
  clientId: string
  clientServiceId: string | null
  hours: number
  currency: string
  value: number
  onChange: (amount: number) => void
}) {
  const lines = useClientServiceLines(clientId, clientId !== '' && clientServiceId !== null)
  const line = (lines.data ?? []).find((l) => l.id === clientServiceId)
  const hourly = line?.billingMode === 'per_hour' ? Number(line.priceMinor) / 100 : null
  const label = currency ? `Monto a facturar (${currency})` : 'Monto a facturar'
  if (hourly !== null) {
    const pack = line ? includedHoursLabel(line) : null
    return (
      <label className="flex flex-col gap-1.5">
        <span className="type-caption fg-subtle">{label}</span>
        <Input type="number" value={Math.round(hourly * hours * 100) / 100} readOnly disabled />
        <span className="type-caption fg-subtle">{`Horas × ${formatCurrency(hourly)} que le cobramos al cliente por hora`}</span>
        {pack ? (
          <span className="type-caption fg-subtle">
            {`Este servicio trae ${pack}: se cobran solo las horas que pasen, y el monto se ajusta al guardar.`}
          </span>
        ) : null}
      </label>
    )
  }
  return (
    <label className="flex flex-col gap-1.5">
      <span className="type-caption fg-subtle">{label}</span>
      <Input
        type="number"
        min={0}
        value={value || ''}
        placeholder="0"
        onChange={(event) => onChange(Number(event.target.value) || 0)}
      />
    </label>
  )
}


import { useId, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Checkbox,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  IconButton,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@/app/components/components'
import type { Currency } from '@hold/shared'
import { DatePicker } from '@/app/components/patterns'
import { AFFORDANCE } from '@/app/lib/icon-registry'
import { todayIso } from '@/app/lib/iso-date'
import { clientsApi } from '@/api/clients'
import { queryKeys } from '@/queries/keys'
import { monthlyTotal } from './clients-service-lines-format'
import type {
  BillingCycle,
  BillingEntity,
  Client,
  ClientStatus,
  PaymentMethod,
} from './clients-mock-data'
import { CLIENT_TYPE_CATALOG, SERVICE_CATALOG } from './clients-mock-data'
import {
  BILLING_CYCLE_LABEL,
  BILLING_ENTITY_FULL_LABEL,
  CLIENT_STATUS_LABEL,
  PAYMENT_METHOD_LABEL,
  formatCurrency,
} from './clients-format'
import { contactDraft, mailtoLink, whatsappLink } from './clients-contact'

export type ClientDialogState =
  | { kind: 'none' }
  | { kind: 'new' }
  | { kind: 'edit'; client: Client }
  | { kind: 'confirm'; client: Client; action: 'pause' | 'churn' }
  | { kind: 'delete'; client: Client }
  | { kind: 'contact'; client: Client }

export type ClientFormValues = {
  name: string
  businessName: string
  taxId: string
  clientType: string
  status: ClientStatus
  monthlyFee: number
  currency: Currency
  billingEntity: BillingEntity | ''
  services: string[]
  contactName: string
  billingEmail: string
  phone: string
  address: string
  secondaryEmail: string
  adminContactName: string
  adminContactEmail: string
  adminContactPhone: string
  paymentMethod: PaymentMethod | ''
  discountPercent: number
  billingCycle: BillingCycle | ''
  projectFee: number
  projectEndDate: string
  startDate: string
}

function emptyForm(): ClientFormValues {
  return {
    name: '',
    businessName: '',
    taxId: '',
    clientType: '',
    status: 'onboarding',
    monthlyFee: 0,
    currency: 'ARS',
    billingEntity: '',
    services: [],
    contactName: '',
    billingEmail: '',
    phone: '',
    address: '',
    secondaryEmail: '',
    adminContactName: '',
    adminContactEmail: '',
    adminContactPhone: '',
    paymentMethod: '',
    discountPercent: 0,
    billingCycle: '',
    projectFee: 0,
    projectEndDate: '',
    startDate: todayIso(),
  }
}

function formFromClient(client: Client): ClientFormValues {
  return {
    name: client.name,
    businessName: client.businessName ?? '',
    taxId: client.taxId ?? '',
    clientType: client.clientType ?? '',
    status: client.status,
    monthlyFee: client.monthlyFee,
    currency: client.currency,
    billingEntity: client.billingEntity ?? '',
    services: [...client.services],
    contactName: client.contactName ?? '',
    billingEmail: client.billingEmail ?? '',
    phone: client.phone ?? '',
    address: client.address ?? '',
    secondaryEmail: client.secondaryEmail ?? '',
    adminContactName: client.adminContactName ?? '',
    adminContactEmail: client.adminContactEmail ?? '',
    adminContactPhone: client.adminContactPhone ?? '',
    paymentMethod: client.paymentMethod ?? '',
    discountPercent: client.discountPercentBp ? client.discountPercentBp / 100 : 0,
    billingCycle: client.billingCycle ?? '',
    projectFee: client.projectFee ?? 0,
    projectEndDate: client.projectEndDate?.slice(0, 10) ?? '',
    startDate: client.startDate?.slice(0, 10) ?? '',
  }
}

const CURRENCY_OPTIONS: readonly Currency[] = ['ARS', 'USD']

export function parseAmountInput(raw: string): number {
  const normalized = raw.replace(/\./g, '').replace(',', '.')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

const amountSeedFormatter = new Intl.NumberFormat('es-AR', {
  maximumFractionDigits: 2,
  useGrouping: true,
})

// Not parseAmountInput: that reads es-AR money ('.' = thousands), so '12.5' would become 125.
export function parsePercentInput(raw: string): number {
  const parsed = Number(raw.replace(',', '.'))
  if (!Number.isFinite(parsed) || parsed <= 0) return 0
  return Math.min(Math.round(parsed * 100) / 100, 100)
}

export function formatAmountSeed(value: number | undefined): string {
  return value && value > 0 ? amountSeedFormatter.format(value) : ''
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="type-caption fg-subtle">{label}</span>
      {children}
    </label>
  )
}

function ClientFormDialog({
  mode,
  client,
  onClose,
  onSubmit,
}: {
  mode: 'new' | 'edit'
  client: Client | null
  onClose: () => void
  onSubmit: (
    mode: 'new' | 'edit',
    values: ClientFormValues,
    client: Client | null,
  ) => void | Promise<void>
}) {
  const [values, setValues] = useState<ClientFormValues>(
    client ? formFromClient(client) : emptyForm(),
  )
  const [pending, setPending] = useState(false)
  const [feeInput, setFeeInput] = useState(formatAmountSeed(client?.monthlyFee))
  const lines = useQuery({
    queryKey: queryKeys.clients.serviceLines(client?.id ?? ''),
    queryFn: () => clientsApi.listServiceLines(client?.id ?? ''),
    enabled: Boolean(client),
  })
  const feeFromLines = (lines.data ?? []).some((l) => l.active && l.billingMode === 'monthly')
    ? monthlyTotal(lines.data ?? [])
    : null
  const [projectFeeInput, setProjectFeeInput] = useState(formatAmountSeed(client?.projectFee))
  const [discountInput, setDiscountInput] = useState(
    formatAmountSeed(client?.discountPercentBp ? client.discountPercentBp / 100 : undefined),
  )
  const servicesLabelId = useId()

  function update<K extends keyof ClientFormValues>(key: K, value: ClientFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return
    setPending(true)
    try {
      await onSubmit(mode, values, client)
    } finally {
      setPending(false)
    }
  }

  function toggleService(service: string, checked: boolean) {
    setValues((prev) => ({
      ...prev,
      services: checked
        ? [...prev.services, service]
        : prev.services.filter((item) => item !== service),
    }))
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-xl">
        <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{mode === 'new' ? 'Nuevo cliente' : 'Editar cliente'}</DialogTitle>
            <DialogDescription>
              Cargá los datos operativos y de facturación del cliente.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Nombre comercial">
              <Input
                value={values.name}
                onChange={(event) => update('name', event.target.value)}
                required
              />
            </Field>
            <Field label="Razón social">
              <Input
                value={values.businessName}
                onChange={(event) => update('businessName', event.target.value)}
              />
            </Field>
            <Field label="CUIT / DNI">
              <Input value={values.taxId} onChange={(event) => update('taxId', event.target.value)} />
            </Field>
            <Field label="Rubro">
              <Select
                value={values.clientType}
                onValueChange={(value) => update('clientType', value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Elegí un rubro">
                    <span>{values.clientType}</span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {CLIENT_TYPE_CATALOG.map((rubro) => (
                    <SelectItem key={rubro} value={rubro}>
                      {rubro}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Estado">
              <Select
                value={values.status}
                onValueChange={(value) => update('status', value as ClientStatus)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(['active', 'onboarding', 'paused', 'churned'] as const).map((status) => (
                    <SelectItem key={status} value={status}>
                      {CLIENT_STATUS_LABEL[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Fee mensual">
              <div className="flex gap-2">
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  className="flex-1"
                  value={feeFromLines !== null ? formatAmountSeed(feeFromLines) : feeInput}
                  readOnly={feeFromLines !== null}
                  disabled={feeFromLines !== null}
                  onChange={(event) => {
                    const next = event.target.value.replace(/[^\d.,]/g, '')
                    setFeeInput(next)
                    update('monthlyFee', parseAmountInput(next))
                  }}
                />
                <Select
                  value={values.currency}
                  onValueChange={(value) => update('currency', value as Currency)}
                >
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCY_OPTIONS.map((currency) => (
                      <SelectItem key={currency} value={currency}>
                        {currency}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {feeFromLines !== null ? (
                <span className="type-caption fg-subtle">
                  {`${formatCurrency(feeFromLines, values.currency)}: la suma de sus servicios mensuales. Se cambia desde Facturación → Servicios. Los servicios por única vez, por producción o por hora se cobran aparte.`}
                </span>
              ) : values.monthlyFee > 0 ? (
                <span className="type-caption fg-subtle">
                  {formatCurrency(values.monthlyFee, values.currency)}
                </span>
              ) : null}
            </Field>
            <Field label="Monotributo">
              <Select
                value={values.billingEntity}
                onValueChange={(value) => update('billingEntity', value as BillingEntity)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Sin asignar" />
                </SelectTrigger>
                <SelectContent>
                  {(['monotributo_1', 'monotributo_2', 'monotributo_3'] as const).map((entity) => (
                    <SelectItem key={entity} value={entity}>
                      {BILLING_ENTITY_FULL_LABEL[entity]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Contacto principal">
              <Input
                value={values.contactName}
                onChange={(event) => update('contactName', event.target.value)}
              />
            </Field>
            <Field label="Email de facturación">
              <Input
                type="email"
                value={values.billingEmail}
                onChange={(event) => update('billingEmail', event.target.value)}
              />
            </Field>
            <Field label="Celular">
              <Input
                type="tel"
                placeholder="+54 9 11 5555 5555"
                value={values.phone}
                onChange={(event) => update('phone', event.target.value)}
              />
            </Field>
            <Field label="Domicilio">
              <Input
                placeholder="Av. Corrientes 1234, CABA"
                value={values.address}
                onChange={(event) => update('address', event.target.value)}
              />
            </Field>
            <Field label="Fecha de inicio">
              <DatePicker
                value={values.startDate}
                onChange={(value) => update('startDate', value)}
                aria-label="Fecha de inicio"
              />
            </Field>
            <Field label="Medio de pago">
              <Select
                value={values.paymentMethod}
                onValueChange={(value) => update('paymentMethod', value as PaymentMethod)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Sin definir" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{PAYMENT_METHOD_LABEL.cash}</SelectItem>
                  <SelectItem value="transfer">{PAYMENT_METHOD_LABEL.transfer}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Descuento">
              <div className="flex items-center gap-2">
                <Input
                  type="text"
                  inputMode="decimal"
                  placeholder="0"
                  className="flex-1"
                  value={discountInput}
                  onChange={(event) => {
                    const next = event.target.value.replace(/[^\d.,]/g, '')
                    const percent = parsePercentInput(next)
                    setDiscountInput(percent === 100 && parseFloat(next.replace(',', '.')) > 100 ? '100' : next)
                    update('discountPercent', percent)
                  }}
                />
                <span className="type-body-2 fg-subtle">%</span>
              </div>
            </Field>
            <Field label="Ciclo de facturación">
              <Select
                value={values.billingCycle}
                onValueChange={(value) => update('billingCycle', value as BillingCycle)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Sin definir" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="arrears">{BILLING_CYCLE_LABEL.arrears}</SelectItem>
                  <SelectItem value="current">{BILLING_CYCLE_LABEL.current}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Contacto administrativo">
              <Input
                value={values.adminContactName}
                onChange={(event) => update('adminContactName', event.target.value)}
              />
            </Field>
            <Field label="Email administrativo">
              <Input
                type="email"
                value={values.adminContactEmail}
                onChange={(event) => update('adminContactEmail', event.target.value)}
              />
            </Field>
            <Field label="Celular administrativo">
              <Input
                type="tel"
                value={values.adminContactPhone}
                onChange={(event) => update('adminContactPhone', event.target.value)}
              />
            </Field>
            <Field label="Email alternativo">
              <Input
                type="email"
                value={values.secondaryEmail}
                onChange={(event) => update('secondaryEmail', event.target.value)}
              />
            </Field>
            <Field label="Fee por proyecto">
              <Input
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={projectFeeInput}
                onChange={(event) => {
                  const next = event.target.value.replace(/[^\d.,]/g, '')
                  setProjectFeeInput(next)
                  update('projectFee', parseAmountInput(next))
                }}
              />
              <span className="type-caption fg-subtle">
                {values.projectFee > 0
                  ? formatCurrency(values.projectFee, values.currency)
                  : 'Dejalo vacío si el cliente es solo de abono mensual'}
              </span>
            </Field>
            <Field label="Fin del proyecto">
              <DatePicker
                value={values.projectEndDate}
                onChange={(value) => update('projectEndDate', value)}
                disabled={values.projectFee <= 0}
                aria-label="Fin del proyecto"
              />
            </Field>
          </div>

          <div role="group" aria-labelledby={servicesLabelId} className="flex flex-col gap-2">
            <span id={servicesLabelId} className="type-caption fg-subtle">
              Servicios contratados
            </span>
            <div className="flex flex-wrap gap-3">
              {SERVICE_CATALOG.map((service) => (
                <label key={service} className="flex items-center gap-2 type-body-2 fg-default">
                  <Checkbox
                    checked={values.services.includes(service)}
                    onCheckedChange={(checked) => toggleService(service, !!checked)}
                  />
                  {service}
                </label>
              ))}
            </div>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outlined" color="primary">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" variant="solid" color="primary" disabled={pending}>
              {pending ? 'Guardando' : mode === 'new' ? 'Crear cliente' : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ConfirmActionDialog({
  client,
  action,
  onClose,
  onConfirm,
}: {
  client: Client
  action: 'pause' | 'churn'
  onClose: () => void
  onConfirm: (client: Client, action: 'pause' | 'churn') => void
}) {
  const isChurn = action === 'churn'
  return (
    <AlertDialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {isChurn ? 'Deshabilitar cliente' : 'Pausar cliente'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {isChurn
              ? `${client.name} queda deshabilitado: sale del flujo activo y deja de facturarse, pero sigue en la lista y lo podés reactivar más adelante.`
              : `${client.name} quedará pausado temporalmente. No se generarán cobros mientras esté pausado.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cancelar</AlertDialogCancel>
          <AlertDialogAction color="primary" onClick={() => onConfirm(client, action)}>
            {isChurn ? 'Deshabilitar' : 'Pausar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function DeleteClientDialog({
  client,
  onClose,
  onConfirm,
}: {
  client: Client
  onClose: () => void
  onConfirm: (client: Client) => void | Promise<void>
}) {
  const [typed, setTyped] = useState('')
  const [pending, setPending] = useState(false)
  const matches = typed.trim().toLocaleLowerCase() === client.name.trim().toLocaleLowerCase()

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!matches || pending) return
    setPending(true)
    try {
      await onConfirm(client)
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-md">
        <form className="flex flex-col gap-4" onSubmit={submit}>
          <DialogHeader>
            <DialogTitle>Eliminar permanente</DialogTitle>
            <DialogDescription>
              {client.name} desaparece del listado y de todas las pantallas. Sus cobros y facturas
              ya registrados se conservan en el historial.
            </DialogDescription>
          </DialogHeader>

          <p className="type-body-2 fg-danger">
            Si solo querés dejar de operarlo, usá <strong>Deshabilitar</strong>: el cliente queda en
            el listado como deshabilitado y podés reactivarlo.
          </p>

          <Field label={`Escribí "${client.name}" para confirmar`}>
            <Input
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoFocus
              autoComplete="off"
              placeholder={client.name}
            />
          </Field>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outlined" color="primary">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" variant="solid" color="danger" disabled={!matches || pending}>
              {pending ? 'Eliminando…' : 'Eliminar permanente'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ContactClientDialog({ client, onClose }: { client: Client; onClose: () => void }) {
  const draft = contactDraft(client)
  const nextEmailId = useRef(0)
  const makeEmailRow = (value: string) => ({ id: nextEmailId.current++, value })
  const [emails, setEmails] = useState<{ id: number; value: string }[]>(() => [
    makeEmailRow(draft.to ?? ''),
  ])
  const [subject, setSubject] = useState(draft.subject)
  const [body, setBody] = useState(draft.body)

  function updateEmail(id: number, value: string) {
    setEmails((prev) => prev.map((row) => (row.id === id ? { ...row, value } : row)))
  }
  function addEmail() {
    setEmails((prev) => [...prev, makeEmailRow('')])
  }
  function removeEmail(id: number) {
    setEmails((prev) => (prev.length <= 1 ? prev : prev.filter((row) => row.id !== id)))
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Contactar cliente</DialogTitle>
          <DialogDescription>
            Editá los datos y enviá el mensaje por mail o WhatsApp a {draft.toName}.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <fieldset className="flex flex-col gap-1.5">
            <legend className="type-caption fg-subtle">Para</legend>
            <div className="flex flex-col gap-2">
              {emails.map((row) => (
                <div key={row.id} className="flex items-center gap-2">
                  <Input
                    type="email"
                    value={row.value}
                    placeholder="nombre@empresa.com"
                    onChange={(event) => updateEmail(row.id, event.target.value)}
                  />
                  <IconButton
                    aria-label="Quitar email"
                    variant="transparent"
                    color="primary"
                    disabled={emails.length <= 1}
                    onClick={() => removeEmail(row.id)}
                  >
                    <AFFORDANCE.close className="size-5" aria-hidden />
                  </IconButton>
                </div>
              ))}
            </div>
            <Button
              variant="transparent"
              color="primary"
              size="dense"
              className="self-start"
              onClick={addEmail}
            >
              <AFFORDANCE.create className="size-4" aria-hidden />
              Agregar email
            </Button>
          </fieldset>

          <Field label="Asunto">
            <Input value={subject} onChange={(event) => setSubject(event.target.value)} />
          </Field>
          <Field label="Mensaje">
            <Textarea
              value={body}
              className="min-h-40"
              onChange={(event) => setBody(event.target.value)}
            />
          </Field>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outlined" color="primary">
              Cancelar
            </Button>
          </DialogClose>
          <Button
            variant="outlined"
            color="primary"
            onClick={() => window.open(whatsappLink(client, body), '_blank', 'noopener,noreferrer')}
          >
            Enviar por WhatsApp
          </Button>
          <Button
            variant="solid"
            color="primary"
            onClick={() => {
              window.location.href = mailtoLink(
                emails.map((row) => row.value),
                subject,
                body,
              )
            }}
          >
            Enviar por mail
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ClientsDialogs({
  state,
  onClose,
  onSubmitClient,
  onConfirmAction,
  onConfirmDelete,
}: {
  state: ClientDialogState
  onClose: () => void
  onSubmitClient: (
    mode: 'new' | 'edit',
    values: ClientFormValues,
    client: Client | null,
  ) => void | Promise<void>
  onConfirmAction: (client: Client, action: 'pause' | 'churn') => void
  onConfirmDelete: (client: Client) => void | Promise<void>
}) {
  if (state.kind === 'new' || state.kind === 'edit') {
    return (
      <ClientFormDialog
        mode={state.kind}
        client={state.kind === 'edit' ? state.client : null}
        onClose={onClose}
        onSubmit={onSubmitClient}
      />
    )
  }
  if (state.kind === 'confirm') {
    return (
      <ConfirmActionDialog
        client={state.client}
        action={state.action}
        onClose={onClose}
        onConfirm={onConfirmAction}
      />
    )
  }
  if (state.kind === 'delete') {
    return <DeleteClientDialog client={state.client} onClose={onClose} onConfirm={onConfirmDelete} />
  }
  if (state.kind === 'contact') {
    return <ContactClientDialog client={state.client} onClose={onClose} />
  }
  return null
}

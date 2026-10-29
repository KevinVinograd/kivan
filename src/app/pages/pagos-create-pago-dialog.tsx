import { useEffect, useState } from 'react'

import type { Currency } from '@hold/shared'

import {
  Button,
  Dialog,
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
  toast,
} from '@/app/components/components'
import { DatePicker } from '@/app/components/patterns'
import { emittersApi } from '@/api/emitters'
import { paymentsApi } from '@/api/payments'
import { teamApi } from '@/api/team'
import { formatMonthYear } from './cobranza-format'
import { RECIPIENT_TYPE_LABEL } from './pagos-format'
import { KeepOpenToggle, useKeepOpen } from './dialog-keep-open'
import type { CreatePagoInput } from './payments-api-data'
import type { RecipientType } from './pagos-mock-data'

const CURRENCY_OPTIONS: readonly Currency[] = ['ARS', 'USD']

const RECIPIENT_TYPE_OPTIONS: RecipientType[] = [
  'collaborator',
  'provider',
  'employee',
  'fixed_expense',
  'monotributo',
  'platform',
]

type Option = { id: string; name: string }

export function PagosCreatePagoDialog({
  period,
  onCreate,
  onClose,
}: {
  period: string
  onCreate: (input: CreatePagoInput) => Promise<void>
  onClose: () => void
}) {
  const [recipientType, setRecipientType] = useState<RecipientType>('collaborator')
  const [providers, setProviders] = useState<Option[]>([])
  const [members, setMembers] = useState<Option[]>([])
  const [providerId, setProviderId] = useState('')
  const [newProviderName, setNewProviderName] = useState('')
  const [teamMemberId, setTeamMemberId] = useState('')
  const [freeName, setFreeName] = useState('')
  const [emitters, setEmitters] = useState<Option[]>([])
  const [linkedProviderId, setLinkedProviderId] = useState('')
  const [invoiceEmitterId, setInvoiceEmitterId] = useState('')
  const [concept, setConcept] = useState('')
  const [amount, setAmount] = useState('0')
  const [currency, setCurrency] = useState<Currency>('ARS')
  const [expectedDate, setExpectedDate] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { keepOpen, setKeepOpen, fieldsRef, focusFirstField } = useKeepOpen()

  useEffect(() => {
    let cancelled = false
    paymentsApi
      .listProviders()
      .then((rows) => {
        if (!cancelled) setProviders(rows.map((p) => ({ id: p.id, name: p.name })))
      })
      .catch(() => {})
    teamApi
      .list({ limit: 100, offset: 0 })
      .then((res) => {
        if (!cancelled) setMembers(res.items.map((m) => ({ id: m.id, name: m.name })))
      })
      .catch(() => {})
    emittersApi
      .list()
      .then((rows) => {
        if (!cancelled) setEmitters(rows.map((e) => ({ id: e.id, name: e.label })))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const needsProvider = recipientType === 'provider'
  const needsMember = recipientType === 'collaborator' || recipientType === 'employee'
  const linksProvider = recipientType === 'fixed_expense' || recipientType === 'platform'
  const linksEmitter = recipientType === 'monotributo'

  const amountN = Number(amount)
  const recipientValid = needsProvider
    ? newProviderName.trim().length > 0 || providerId.length > 0
    : needsMember
      ? teamMemberId.length > 0
      : freeName.trim().length > 0
  const valid =
    recipientValid &&
    concept.trim().length > 0 &&
    Number.isFinite(amountN) &&
    amountN > 0 &&
    expectedDate.length > 0

  async function handleCreate() {
    if (!valid || submitting) return
    setSubmitting(true)
    try {
      let recipientName = ''
      const fk: { providerId?: string; teamMemberId?: string; invoiceEmitterId?: string } = {}
      if (needsProvider) {
        if (newProviderName.trim()) {
          const created = await paymentsApi.createProvider({ name: newProviderName.trim() })
          fk.providerId = created.id
          recipientName = created.name
          setProviders((prev) =>
            prev.some((p) => p.id === created.id) ? prev : [...prev, { id: created.id, name: created.name }],
          )
          setProviderId(created.id)
        } else {
          fk.providerId = providerId
          recipientName = providers.find((p) => p.id === providerId)?.name ?? ''
        }
      } else if (needsMember) {
        fk.teamMemberId = teamMemberId
        recipientName = members.find((m) => m.id === teamMemberId)?.name ?? ''
      } else {
        recipientName = freeName.trim()
        if (linksProvider && linkedProviderId) fk.providerId = linkedProviderId
        if (linksEmitter && invoiceEmitterId) fk.invoiceEmitterId = invoiceEmitterId
      }
      await onCreate({
        recipientType,
        recipientName,
        period,
        concept,
        totalAmount: amountN,
        currency,
        expectedDate,
        ...fk,
      })
      toast.success('Pago creado')
      if (keepOpen) {
        setConcept('')
        setAmount('0')
        setNewProviderName('')
        setSubmitting(false)
        focusFirstField('Concepto')
        return
      }
      onClose()
    } catch {
      toast.error('No se pudo crear el pago')
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo pago</DialogTitle>
          <DialogDescription>Período {formatMonthYear(period)}</DialogDescription>
        </DialogHeader>

        <div ref={fieldsRef} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="type-caption fg-subtle">Tipo</span>
            <Select
              value={recipientType}
              onValueChange={(value) => setRecipientType(value as RecipientType)}
            >
              <SelectTrigger className="w-full" aria-label="Tipo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RECIPIENT_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {RECIPIENT_TYPE_LABEL[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          {needsProvider ? (
            <div className="flex flex-col gap-2">
              <label className="flex flex-col gap-1.5">
                <span className="type-caption fg-subtle">Proveedor</span>
                <Select
                  value={providerId}
                  onValueChange={(value) => {
                    setProviderId(value)
                    setNewProviderName('')
                  }}
                >
                  <SelectTrigger className="w-full" aria-label="Proveedor" disabled={providers.length === 0}>
                    <SelectValue placeholder={providers.length ? 'Elegí un proveedor' : 'Sin proveedores'} />
                  </SelectTrigger>
                  <SelectContent>
                    {providers.map((provider) => (
                      <SelectItem key={provider.id} value={provider.id}>
                        {provider.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="type-caption fg-subtle">…o nuevo proveedor</span>
                <Input
                  value={newProviderName}
                  onChange={(event) => {
                    setNewProviderName(event.target.value)
                    if (event.target.value) setProviderId('')
                  }}
                  placeholder="Nombre del proveedor"
                  aria-label="Nuevo proveedor"
                />
              </label>
            </div>
          ) : needsMember ? (
            <label className="flex flex-col gap-1.5">
              <span className="type-caption fg-subtle">
                {recipientType === 'employee' ? 'Empleado' : 'Colaboradora'}
              </span>
              <Select value={teamMemberId} onValueChange={setTeamMemberId}>
                <SelectTrigger
                  className="w-full"
                  aria-label="Miembro del equipo"
                  disabled={members.length === 0}
                >
                  <SelectValue placeholder={members.length ? 'Elegí un miembro' : 'Sin miembros'} />
                </SelectTrigger>
                <SelectContent>
                  {members.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {members.length === 0 ? (
                <span className="type-caption fg-subtle">
                  Primero creá un miembro en la sección Equipo.
                </span>
              ) : null}
            </label>
          ) : (
            <label className="flex flex-col gap-1.5">
              <span className="type-caption fg-subtle">Destinatario</span>
              <Input
                value={freeName}
                onChange={(event) => setFreeName(event.target.value)}
                aria-label="Destinatario"
              />
            </label>
          )}

          {linksProvider ? (
            <label className="flex flex-col gap-1.5">
              <span className="type-caption fg-subtle">Proveedor (opcional)</span>
              <Select value={linkedProviderId} onValueChange={setLinkedProviderId}>
                <SelectTrigger
                  className="w-full"
                  aria-label="Proveedor (opcional)"
                  disabled={providers.length === 0}
                >
                  <SelectValue
                    placeholder={providers.length ? 'A quién se le paga' : 'Sin proveedores'}
                  />
                </SelectTrigger>
                <SelectContent>
                  {providers.map((provider) => (
                    <SelectItem key={provider.id} value={provider.id}>
                      {provider.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          ) : linksEmitter ? (
            <label className="flex flex-col gap-1.5">
              <span className="type-caption fg-subtle">Monotributo (opcional)</span>
              <Select value={invoiceEmitterId} onValueChange={setInvoiceEmitterId}>
                <SelectTrigger
                  className="w-full"
                  aria-label="Monotributo (opcional)"
                  disabled={emitters.length === 0}
                >
                  <SelectValue
                    placeholder={emitters.length ? 'De qué monotributo' : 'Sin monotributos'}
                  />
                </SelectTrigger>
                <SelectContent>
                  {emitters.map((emitter) => (
                    <SelectItem key={emitter.id} value={emitter.id}>
                      {emitter.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          ) : null}

          <label className="flex flex-col gap-1.5">
            <span className="type-caption fg-subtle">Concepto</span>
            <Input
              value={concept}
              onChange={(event) => setConcept(event.target.value)}
              aria-label="Concepto"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <span className="type-caption fg-subtle">Monto</span>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min={0}
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  aria-label="Monto"
                />
                <Select value={currency} onValueChange={(value) => setCurrency(value as Currency)}>
                  <SelectTrigger className="w-24" aria-label="Moneda">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCY_OPTIONS.map((option) => (
                      <SelectItem key={option} value={option}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <label className="flex flex-col gap-1.5">
              <span className="type-caption fg-subtle">Fecha esperada</span>
              <DatePicker value={expectedDate} onChange={setExpectedDate} required aria-label="Fecha esperada" />
            </label>
          </div>
        </div>

        <DialogFooter>
          <KeepOpenToggle checked={keepOpen} onCheckedChange={setKeepOpen} />
          <Button variant="outlined" color="primary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="solid"
            color="primary"
            disabled={!valid || submitting}
            onClick={handleCreate}
          >
            Crear pago
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

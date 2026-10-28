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

/** Mirrors `CURRENCY_OPTIONS` in clients-dialogs.tsx and cashflow-commitment-dialog.tsx
 *  (the same two lanes). Repeated locally rather than shared, per the component-rule
 *  policy: each surface governs its own copy. */
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

/**
 * Nuevo pago — create a payment for the selected period. On submit it persists via
 * `onCreate` (POST /payments). The recipient is resolved by type: proveedor →
 * picked from GET /providers (or created inline via POST /providers);
 * colaboradora/empleado → picked from GET /team-members; the rest (gasto fijo,
 * monotributo, plataforma) take a free-text name.
 */
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
  // The counterparty a gasto fijo / plataforma / monotributo is paid TO. Optional on all
  // three: it is what lets the projection supersede the matching commitment by identity,
  // and a pago that names nobody still works exactly as it did.
  const [emitters, setEmitters] = useState<Option[]>([])
  const [linkedProviderId, setLinkedProviderId] = useState('')
  const [invoiceEmitterId, setInvoiceEmitterId] = useState('')
  const [concept, setConcept] = useState('')
  const [amount, setAmount] = useState('0')
  // The lane, asked here or never: `UpdatePagoInput` has no currency, because the API's
  // PATCH body does not accept one. It deliberately survives a keep-open reset, like the
  // recipient and its type: a batch of dollar pagos is one lane, entered several times.
  const [currency, setCurrency] = useState<Currency>('ARS')
  const [expectedDate, setExpectedDate] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { keepOpen, setKeepOpen, fieldsRef, focusFirstField } = useKeepOpen()

  // Load the pickers' options (providers + team members).
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
  // Who this is paid to, for the three types that take a free-text name. OPTIONAL, so it
  // never gates `valid`: a bank fee filed as a gasto fijo genuinely has nobody to name,
  // and attaching an unrelated proveedor to satisfy a required field would create a live
  // netting key against that proveedor's real pagos — worse than no link at all.
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
          // ADOPT it into this dialog's state. The provider list is fetched once with `[]`
          // deps, so a provider minted here is in neither the dropdown nor the text field
          // after a keep-open reset — which left the form unsubmittable with no way to pick
          // the provider just created, and made retyping the same name mint a duplicate.
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
        // Sent only when chosen. Both are forwarded EXPLICITLY here rather than spread
        // from a wider object, so a field added to this form cannot be silently dropped
        // on the way to the API.
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
      // Only after the write landed. The recipient and its type survive the reset — a batch
      // is usually several concepts for the same collaborator or provider — and for an
      // inline-created provider that is only true because it was adopted above.
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
                {/* Disabled when there is nothing to pick. A Radix Select with no items
                    still OPENS on click — an empty popover, which reads as a control that
                    is broken rather than one that is not ready. The hint below already says
                    what to do; this is what stops the click from looking like a failure.
                    Reported from production as "hago click y no me abre" by an operator
                    loading her first month, before any collaborator existed. */}
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

          {/* Optional, and labelled as such. The projection uses it to tell "the rent was
              paid" from "some money went out that week"; without it the pago still counts,
              just on the coarser category key. */}
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
            {/* The focus target after a keep-open reset: the recipient is kept, so Concepto
                is the first field still needing an answer. */}
            <Input
              value={concept}
              onChange={(event) => setConcept(event.target.value)}
              aria-label="Concepto"
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            {/* A div, not a label: a <label> wrapping BOTH controls would associate its
                click with the first labelable one, so a click meant for the currency
                trigger would land on the amount input. Each control carries its own
                aria-label, so the visible caption is decorative and nothing is lost. */}
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

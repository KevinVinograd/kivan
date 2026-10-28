import { useEffect, useState } from 'react'

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
import { clientsApi } from '@/api/clients'
import { SERVICE_CATALOG } from './clients-mock-data'
import { KeepOpenToggle, useKeepOpen } from './dialog-keep-open'
import { formatCurrency, formatMonthYear } from './cobranza-format'
import type { CreateCobroInput } from './receivables-api-data'

type ClientOption = { id: string; name: string; services: string[] }

/**
 * Nuevo cobro — create a receivable for the selected period against a REAL client
 * (picked from GET /clients). The fiscal data lives on the client, so it is not
 * re-entered here. On submit it persists via `onCreate` (POST /receivables, which
 * derives the total server-side). Amounts are non-negative and the total ≥ 0.
 *
 * The service is picked from the client's own contracted services, not typed. It used
 * to be a free-text Input, so `Receivable.service` accumulated whatever each operator
 * happened to write: the same service reached the reports under several spellings and
 * matched nothing. The server does not constrain the string either (it takes any
 * `service` and stores it), so the closed set has to be offered here.
 */
export function CobrosCreateCobroDialog({
  period,
  onCreate,
  onClose,
}: {
  period: string
  onCreate: (input: CreateCobroInput) => Promise<void>
  onClose: () => void
}) {
  const [clients, setClients] = useState<ClientOption[]>([])
  const [loadFailed, setLoadFailed] = useState(false)
  const [clientId, setClientId] = useState('')
  const [service, setService] = useState('')
  const [base, setBase] = useState('0')
  const [extra, setExtra] = useState('0')
  const [discount, setDiscount] = useState('0')
  const [dueDate, setDueDate] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const { keepOpen, setKeepOpen, fieldsRef, focusFirstField } = useKeepOpen()

  // Load the workspace's clients to pick from (id + name only).
  useEffect(() => {
    let cancelled = false
    clientsApi
      .list({ limit: 100, offset: 0 })
      .then((res) => {
        if (!cancelled) {
          setClients(res.items.map((c) => ({ id: c.id, name: c.name, services: c.services })))
          setLoadFailed(false)
        }
      })
      // A failed fetch and an empty workspace both leave the picker empty, and only one of
      // them is fixed by "creá un cliente". Telling someone with a full roster to create a
      // client is the one instruction that cannot help them.
      .catch(() => {
        if (!cancelled) setLoadFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // What this client actually contracted. A client with nothing recorded falls back to
  // the full catalog rather than to an empty list the user cannot get past — the roster
  // predates the services field, so plenty of rows still carry none.
  const selectedClient = clients.find((client) => client.id === clientId)
  const serviceOptions = selectedClient?.services.length
    ? selectedClient.services
    : [...SERVICE_CATALOG]

  // Changing the client clears the service: the previous pick may not be on the new
  // client's contract, and silently keeping it is how you bill someone for a service
  // they never hired.
  function handleClientChange(next: string) {
    setClientId(next)
    setService('')
  }

  const baseN = Number(base)
  const extraN = Number(extra)
  const discountN = Number(discount)
  const amountsValid = [baseN, extraN, discountN].every((n) => Number.isFinite(n) && n >= 0)
  const total = baseN + extraN - discountN
  // Named, so a disabled submit is never mistaken for a broken one. The amount problems
  // stay out of this list: the Total row already reports them in place, right where the
  // offending value is.
  const missing = [
    clientId.length === 0 ? 'cliente' : null,
    service.trim().length === 0 ? 'servicio' : null,
    dueDate.length === 0 ? 'vencimiento' : null,
  ].filter((field): field is string => field !== null)
  const valid = missing.length === 0 && amountsValid && total >= 0

  async function handleCreate() {
    if (!valid || submitting) return
    setSubmitting(true)
    try {
      await onCreate({
        clientId,
        period,
        service,
        baseAmount: baseN,
        extraAmount: extraN,
        discountAmount: discountN,
        dueDate,
      })
      toast.success('Cobro creado')
      // Only after the write landed. The client and the vencimiento survive the reset:
      // a batch is usually several services for the same client in the same period, and
      // clearing them would make the toggle cost more keystrokes than it saves.
      if (keepOpen) {
        setService('')
        setBase('0')
        setExtra('0')
        setDiscount('0')
        setSubmitting(false)
        // Servicio, not Cliente: the client is what the reset deliberately KEEPS, so the
        // first field still needing an answer is the service.
        focusFirstField('Servicio')
        return
      }
      onClose()
    } catch {
      toast.error('No se pudo crear el cobro')
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo cobro</DialogTitle>
          <DialogDescription>Período {formatMonthYear(period)}</DialogDescription>
        </DialogHeader>

        <div ref={fieldsRef} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="type-caption fg-subtle">Cliente</span>
            <Select value={clientId} onValueChange={handleClientChange}>
              {/* Disabled when the list is empty or failed to load. A Radix Select with
                  no items still OPENS on click, and an empty popover reads as a broken
                  control rather than one that has nothing to offer yet. The placeholder
                  and the message below say which of the two it is. */}
              <SelectTrigger
                className="w-full"
                aria-label="Cliente"
                disabled={clients.length === 0}
              >
                <SelectValue
                  placeholder={
                    loadFailed ? 'No se pudo cargar' : clients.length ? 'Elegí un cliente' : 'Sin clientes'
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {loadFailed ? (
              <span className="type-caption fg-danger">
                No se pudieron cargar los clientes, volvé a abrir el formulario
              </span>
            ) : clients.length === 0 ? (
              <span className="type-caption fg-subtle">
                Primero creá un cliente en la sección Clientes
              </span>
            ) : null}
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="type-caption fg-subtle">Servicio</span>
            <Select value={service} onValueChange={setService} disabled={!clientId}>
              <SelectTrigger className="w-full" aria-label="Servicio">
                <SelectValue placeholder={clientId ? 'Elegí un servicio' : 'Elegí un cliente primero'} />
              </SelectTrigger>
              <SelectContent>
                {serviceOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedClient && selectedClient.services.length === 0 ? (
              <span className="type-caption fg-subtle">
                Este cliente no tiene servicios contratados cargados, se muestra el catálogo completo
              </span>
            ) : null}
          </label>
          <div className="grid grid-cols-3 gap-2">
            <label className="flex flex-col gap-1.5">
              <span className="type-caption fg-subtle">Monto base</span>
              <Input type="number" min={0} value={base} onChange={(event) => setBase(event.target.value)} aria-label="Monto base" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="type-caption fg-subtle">Extras</span>
              <Input type="number" min={0} value={extra} onChange={(event) => setExtra(event.target.value)} aria-label="Extras" />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="type-caption fg-subtle">Descuentos</span>
              <Input type="number" min={0} value={discount} onChange={(event) => setDiscount(event.target.value)} aria-label="Descuentos" />
            </label>
          </div>
          <div className="flex items-center justify-between rounded-control bg-alpha-subtle px-3 py-2">
            <span className="type-caption fg-subtle">Total</span>
            <span className="type-button fg-default tabular-nums">
              {amountsValid ? formatCurrency(total) : 'Monto inválido'}
            </span>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="type-caption fg-subtle">Vencimiento</span>
            <DatePicker value={dueDate} onChange={setDueDate} required aria-label="Vencimiento" />
          </label>
        </div>

        {/* A contradiction the user typed is an error state (`fg-danger`); a field they have not reached yet is not their mistake, so it
            takes `fg-default` — which still separates it from the `fg-subtle` field labels it
            would otherwise be indistinguishable from. */}
        {total < 0 ? (
          <p className="type-caption fg-danger" role="alert">
            El descuento no puede superar la suma del monto base y los extras
          </p>
        ) : missing.length > 0 ? (
          <p className="type-caption fg-default" role="status">
            Falta completar: {missing.join(', ')}
          </p>
        ) : null}

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
            Crear cobro
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

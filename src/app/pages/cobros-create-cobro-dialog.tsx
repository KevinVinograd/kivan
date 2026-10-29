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
      .catch(() => {
        if (!cancelled) setLoadFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const selectedClient = clients.find((client) => client.id === clientId)
  const serviceOptions = selectedClient?.services.length
    ? selectedClient.services
    : [...SERVICE_CATALOG]

  function handleClientChange(next: string) {
    setClientId(next)
    setService('')
  }

  const baseN = Number(base)
  const extraN = Number(extra)
  const discountN = Number(discount)
  const amountsValid = [baseN, extraN, discountN].every((n) => Number.isFinite(n) && n >= 0)
  const total = baseN + extraN - discountN
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
      if (keepOpen) {
        setService('')
        setBase('0')
        setExtra('0')
        setDiscount('0')
        setSubmitting(false)
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

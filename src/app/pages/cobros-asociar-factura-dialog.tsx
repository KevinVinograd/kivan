import { useState } from 'react'

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Checkbox,
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
  Textarea,
  toast,
} from '@/app/components/components'
import { DatePicker } from '@/app/components/patterns'
import { todayIso } from '@/app/lib/iso-date'
import { formatMoney } from './cobranza-format'
import { INVOICE_EMITTERS, suggestedEmitter, type EmitterId } from './cobros-invoice'
import type { Receivable } from './cobros-mock-data'

// `todayIso()` is called per render inside the component below, NOT once at module scope.
// It used to be the literal '2026-06-16', and `futureDate` gates `valid` — so from 17 June
// 2026 onwards, entering the invoice's actual emission date tripped "la fecha de emisión no
// puede ser futura" and the submit never enabled. A module-level `todayIso()` would fix that
// and then reintroduce it in miniature: this is a long-lived SPA, and a tab left open across
// midnight would freeze the ceiling on yesterday and refuse today's date.

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="type-caption fg-subtle">{label}</span>
      {children}
    </label>
  )
}

/**
 * Asociar factura existente (§9.7) — register an externally emitted factura.
 * Validations: número no vacío y no duplicado, fecha de emisión no posterior a hoy,
 * y confirmación explícita si el monto difiere del total del cobro. The result is
 * a local mutation to the "Asociado manualmente" billing state.
 */
export function CobrosAsociarFacturaDialog({
  receivable,
  existingInvoiceNumbers,
  onAssociate,
  onClose,
}: {
  receivable: Receivable
  existingInvoiceNumbers: string[]
  /** Persist the external factura (POST /receivables/:id/invoice/associate). */
  onAssociate: (id: string, invoiceNumber: string, issuedAt: string) => Promise<void>
  onClose: () => void
}) {
  const TODAY = todayIso()
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [issuedAt, setIssuedAt] = useState(todayIso)
  const [emitter, setEmitter] = useState<EmitterId>(() => suggestedEmitter(receivable).id)
  const [amount, setAmount] = useState(receivable.totalAmount)
  const [notes, setNotes] = useState('')
  const [amountConfirmed, setAmountConfirmed] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const trimmed = invoiceNumber.trim()
  const taken = new Set(existingInvoiceNumbers.map((value) => value.trim()))
  const duplicate = trimmed !== '' && taken.has(trimmed)
  const futureDate = issuedAt > TODAY
  const amountDiffers = amount !== receivable.totalAmount

  const valid =
    trimmed !== '' &&
    !duplicate &&
    !futureDate &&
    amount > 0 &&
    (!amountDiffers || amountConfirmed)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!valid || submitting) return
    setSubmitting(true)
    try {
      await onAssociate(receivable.id, trimmed, issuedAt)
    } catch {
      toast.error('No se pudo asociar la factura')
      setSubmitting(false)
      return
    }
    toast.success('Factura asociada')
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Asociar factura existente</DialogTitle>
            <DialogDescription>
              {receivable.clientName} · Total {formatMoney(receivable.totalAmount, receivable.currency)}
            </DialogDescription>
          </DialogHeader>

          <Field label="Número de factura">
            <Input
              value={invoiceNumber}
              onChange={(event) => setInvoiceNumber(event.target.value)}
              placeholder="0001-00000123"
              autoFocus
            />
          </Field>
          {duplicate ? (
            <p className="type-caption fg-danger">Ese número de factura ya está registrado</p>
          ) : null}

          <Field label="Fecha de emisión">
            <DatePicker value={issuedAt} onChange={setIssuedAt} required aria-label="Fecha de emisión" />
          </Field>
          {futureDate ? (
            <p className="type-caption fg-danger">La fecha de emisión no puede ser posterior a hoy</p>
          ) : null}

          <Field label="Monotributo emisor">
            <Select value={emitter} onValueChange={(value) => setEmitter(value as EmitterId)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INVOICE_EMITTERS.map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          {/* The lane comes from the cobro, which may not be pesos. A hard "(ARS)" here
              told the operator to enter pesos for a dollar comprobante. */}
          <Field label={`Monto (${receivable.currency})`}>
            <Input
              type="number"
              min={0}
              value={amount}
              onChange={(event) => setAmount(Number(event.target.value) || 0)}
            />
          </Field>

          {amountDiffers ? (
            <Alert variant="warning">
              <AlertTitle>El monto difiere del total del cobro</AlertTitle>
              <AlertDescription>
                <span>El cobro es por {formatMoney(receivable.totalAmount, receivable.currency)}.</span>
                <label className="flex items-center gap-2 type-body-2 fg-default">
                  <Checkbox checked={amountConfirmed} onCheckedChange={(checked) => setAmountConfirmed(!!checked)} />
                  Confirmo el monto distinto
                </label>
              </AlertDescription>
            </Alert>
          ) : null}

          <Field label="Notas">
            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              className="min-h-20"
              placeholder="Opcional"
            />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outlined" color="primary" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" variant="solid" color="primary" disabled={!valid}>
              Asociar factura
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

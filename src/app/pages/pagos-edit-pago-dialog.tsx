import { useState } from 'react'

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  toast,
} from '@/app/components/components'
import { DatePicker } from '@/app/components/patterns'
import { formatMoney, formatMonthYear } from './cobranza-format'
import type { UpdatePagoInput } from './payments-api-data'
import type { Payment } from './pagos-mock-data'

export function PagosEditPagoDialog({
  payment,
  onSave,
  onClose,
}: {
  payment: Payment
  onSave: (input: UpdatePagoInput) => Promise<void>
  onClose: () => void
}) {
  const [concept, setConcept] = useState(payment.concept)
  const [amount, setAmount] = useState(String(payment.totalAmount))
  const [expectedDate, setExpectedDate] = useState(payment.expectedDate.slice(0, 10))
  const [submitting, setSubmitting] = useState(false)

  const amountN = Number(amount)
  const amountValid = Number.isFinite(amountN) && amountN >= payment.paidAmount
  const valid = concept.trim().length > 0 && amountValid && expectedDate.length > 0

  async function handleSave() {
    if (!valid || submitting) return
    setSubmitting(true)
    try {
      await onSave({ concept, totalAmount: amountN, expectedDate })
      toast.success('Cambios guardados')
      onClose()
    } catch {
      toast.error('No se pudo guardar el pago')
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar pago</DialogTitle>
          <DialogDescription>Período {formatMonthYear(payment.period)}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="type-caption fg-subtle">Concepto</span>
            <Input value={concept} onChange={(event) => setConcept(event.target.value)} aria-label="Concepto" />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1.5">
              <span className="type-caption fg-subtle">Monto</span>
              <Input
                type="number"
                min={0}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                aria-label="Monto"
              />
              {payment.paidAmount > 0 ? (
                <span className="type-caption fg-subtle">
                  Ya pagado: {formatMoney(payment.paidAmount, payment.currency)}
                </span>
              ) : null}
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="type-caption fg-subtle">Fecha esperada</span>
              <DatePicker value={expectedDate} onChange={setExpectedDate} required aria-label="Fecha esperada" />
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outlined" color="primary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="solid"
            color="primary"
            disabled={!valid || submitting}
            onClick={handleSave}
          >
            Guardar cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

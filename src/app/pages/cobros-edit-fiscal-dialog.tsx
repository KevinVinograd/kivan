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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@/app/components/components'
import { formatMonthYear, TAX_PROFILE_LABEL, type TaxProfileId } from './cobranza-format'
import { editFiscalData } from './cobros-invoice'
import type { Receivable } from './cobros-mock-data'

const TAX_PROFILE_OPTIONS: TaxProfileId[] = [
  'monotributo_1',
  'monotributo_2',
  'monotributo_3',
  'unassigned',
]

/**
 * Editar datos fiscales (§9.4) — edit the razón social, CUIT and monotributo a
 * factura needs. Local-state only via `editFiscalData`, which also lifts a
 * "pendiente de datos" cobro to `no_invoice` once the data is complete.
 */
export function CobrosEditFiscalDataDialog({
  receivable,
  onApply,
  onClose,
}: {
  receivable: Receivable
  onApply: (next: Receivable) => void
  onClose: () => void
}) {
  const [businessName, setBusinessName] = useState(receivable.businessName ?? '')
  const [taxId, setTaxId] = useState(receivable.taxId ?? '')
  const [taxProfileId, setTaxProfileId] = useState<TaxProfileId>(receivable.taxProfileId)
  const isComplete =
    businessName.trim().length > 0 && taxId.trim().length > 0 && taxProfileId !== 'unassigned'

  function handleSave() {
    onApply(editFiscalData(receivable, { businessName, taxId, taxProfileId }))
    toast.success('Datos fiscales guardados')
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar datos fiscales</DialogTitle>
          <DialogDescription>
            {receivable.clientName} · {formatMonthYear(receivable.period)}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="type-caption fg-subtle">Razón social</span>
            <Input
              value={businessName}
              onChange={(event) => setBusinessName(event.target.value)}
              aria-label="Razón social"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="type-caption fg-subtle">CUIT / DNI</span>
            <Input value={taxId} onChange={(event) => setTaxId(event.target.value)} aria-label="CUIT / DNI" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="type-caption fg-subtle">Monotributo</span>
            <Select value={taxProfileId} onValueChange={(value) => setTaxProfileId(value as TaxProfileId)}>
              <SelectTrigger className="w-full" aria-label="Monotributo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TAX_PROFILE_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {TAX_PROFILE_LABEL[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outlined" color="primary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="solid" color="primary" disabled={!isComplete} onClick={handleSave}>
            Guardar cambios
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

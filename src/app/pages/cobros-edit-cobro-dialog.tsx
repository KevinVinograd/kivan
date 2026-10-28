import { useState } from 'react'
import { ApiError } from '@/api/client'

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
import { hasCapability } from '@hold/shared'
import { useRole } from '@/app/lib/use-role'
import { SERVICE_CATALOG } from './clients-mock-data'
import { formatCurrency, formatMoney, formatMonthYear, NO_VALUE } from './cobranza-format'
import type { UpdateCobroInput } from './receivables-api-data'
import type { Receivable } from './cobros-mock-data'

/**
 * Editar cobro — edit the amounts and service fields of a receivable. `totalAmount`
 * is recomputed live (base + extra - discount); on save it persists via `onSave`
 * (PATCH /receivables/:id, which re-derives the total server-side and rejects a
 * total below what's already collected). Amounts must be non-negative.
 *
 * The service is a closed set here too, matching Nuevo cobro. `Receivable` carries a
 * `clientName` and no `clientId`, so this dialog cannot resolve the client's own
 * contracted services the way the create dialog does; it offers the full catalog
 * instead. Rows written before the catalog existed keep their stored value as an
 * option, so correcting an amount never silently rewrites what the client was billed for.
 */
/**
 * The costs a cobro carries beyond the people on it. Design, communication and
 * production used to be typed here too; since 2026-10-01 the cost of the PEOPLE comes
 * from each client's assignments ("Le pagamos por este cliente"), so they left this form
 * rather than become a second place to enter the same salary. Viáticos followed: they are
 * recorded on each production, where HOLD also marks them paid.
 */
type CostArea = 'pauta' | 'fixed'
const COST_AREAS: { key: CostArea; label: string }[] = [
  { key: 'pauta', label: 'Pauta' },
  { key: 'fixed', label: 'Fijos asignados' },
]

export function CobrosEditCobroDialog({
  receivable,
  onSave,
  onClose,
}: {
  receivable: Receivable
  onSave: (input: UpdateCobroInput) => Promise<void>
  onClose: () => void
}) {
  const [base, setBase] = useState(String(receivable.baseAmount))
  const [extra, setExtra] = useState(String(receivable.extraAmount))
  const [discount, setDiscount] = useState(String(receivable.discountAmount))
  const [service, setService] = useState(receivable.service)
  const [dueDate, setDueDate] = useState(receivable.dueDate.slice(0, 10))
  const [submitting, setSubmitting] = useState(false)
  // Cost by area. Only a viewer holding `profitability` may see or write it (the server
  // enforces the write); for anyone else the section is absent and nothing is sent.
  const { capabilities } = useRole()
  const canEditCosts = hasCapability(capabilities, 'profitability')
  const [costs, setCosts] = useState<Record<CostArea, string>>({
    pauta: String(receivable.costs?.pauta ?? 0),
    fixed: String(receivable.costs?.fixed ?? 0),
  })
  const costN = (area: CostArea): number => Number(costs[area])
  const costsValid = COST_AREAS.every(({ key }) => Number.isFinite(costN(key)) && costN(key) >= 0)
  const costTotal = COST_AREAS.reduce((sum, { key }) => sum + (costN(key) || 0), 0)

  const serviceOptions: string[] = (SERVICE_CATALOG as readonly string[]).includes(receivable.service)
    ? [...SERVICE_CATALOG]
    : [receivable.service, ...SERVICE_CATALOG]

  const baseN = Number(base)
  const extraN = Number(extra)
  const discountN = Number(discount)
  const amountsValid = [baseN, extraN, discountN].every((n) => Number.isFinite(n) && n >= 0)
  const total = baseN + extraN - discountN
  const valid =
    amountsValid &&
    total >= 0 &&
    service.trim().length > 0 &&
    dueDate.length > 0 &&
    (!canEditCosts || costsValid)

  async function handleSave() {
    if (!valid || submitting) return
    setSubmitting(true)
    try {
      await onSave({
        service,
        // Only a changed base. An itemized cobro's base is the sum of its lines and the API
        // refuses to change it; resending the unchanged one made every save of such a cobro
        // fail, extras and discount included.
        ...(baseN !== receivable.baseAmount ? { baseAmount: baseN } : {}),
        extraAmount: extraN,
        discountAmount: discountN,
        dueDate,
        // Omitted entirely for a viewer without the capability, so an edit by them never
        // blanks costs someone else recorded.
        ...(canEditCosts
          ? {
              costs: {
                pauta: costN('pauta'),
                fixed: costN('fixed'),
              },
            }
          : {}),
      })
      toast.success('Cambios guardados')
      onClose()
    } catch (error) {
      // The server says why (e.g. "Este cobro está desglosado por servicio…"), and that is
      // the one thing the operator needs to fix it.
      toast.error('No se pudo guardar el cobro', {
        description: error instanceof ApiError && error.message ? error.message : 'Probá de nuevo en un momento.',
      })
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar cobro</DialogTitle>
          <DialogDescription>
            {receivable.clientName} · {formatMonthYear(receivable.period)}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="type-caption fg-subtle">Servicio</span>
            <Select value={service} onValueChange={setService}>
              <SelectTrigger className="w-full" aria-label="Servicio">
                <SelectValue placeholder="Elegí un servicio" />
              </SelectTrigger>
              <SelectContent>
                {serviceOptions.map((option) => (
                  <SelectItem key={option} value={option}>
                    {option}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              {amountsValid ? formatMoney(total, receivable.currency) : 'Monto inválido'}
            </span>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="type-caption fg-subtle">Vencimiento</span>
            <DatePicker value={dueDate} onChange={setDueDate} required aria-label="Vencimiento" />
          </label>

          {canEditCosts ? (
            <div className="flex flex-col gap-2 border-t border-alpha-subtle pt-3">
              <div className="flex flex-col gap-0.5">
                <span className="type-caption fg-default">Costos por área</span>
                <span className="type-caption fg-subtle">
                  Lo que costó el trabajo. No cambia lo que se le factura al cliente: define la
                  rentabilidad.
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {COST_AREAS.map(({ key, label }) => (
                  <label key={key} className="flex flex-col gap-1.5">
                    <span className="type-caption fg-subtle">{label}</span>
                    <Input
                      type="number"
                      min={0}
                      value={costs[key]}
                      onChange={(event) =>
                        setCosts((prev) => ({ ...prev, [key]: event.target.value }))
                      }
                      aria-label={`Costo ${label}`}
                    />
                  </label>
                ))}
              </div>
              {/* `total` is in the COBRO's lane; the six cost inputs above are peso
                  figures with nowhere else to live (one `currency` column governs the
                  whole row). So `total - costTotal` on a non-peso cobro subtracts pesos
                  from dollars and yields a number in no currency at all — which this
                  printed under a "$". There is no formatter that fixes that.

                  Until the model can hold a peso equivalent of a non-peso total, the
                  honest move is to not state a margin rather than to state a wrong one.
                  Whether a dollar cobro should have a margin at all is a product
                  decision; refusing to invent one is correct under either answer. */}
              <div className="flex items-center justify-between rounded-control bg-alpha-subtle px-3 py-2">
                <span className="type-caption fg-subtle">Rentabilidad</span>
                <span className="type-button fg-default tabular-nums">
                  {receivable.currency !== 'ARS'
                    ? NO_VALUE
                    : amountsValid && costsValid
                      ? formatCurrency(total - costTotal)
                      : 'Monto inválido'}
                </span>
              </div>
              {receivable.currency !== 'ARS' ? (
                <span className="type-caption fg-subtle">
                  Los costos se registran en pesos y este cobro no. La rentabilidad se calcula
                  cuando el cobro está en pesos.
                </span>
              ) : null}
            </div>
          ) : null}
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

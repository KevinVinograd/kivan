/**
 * "Cobrar" a one-time service: bill part of its price (an anticipo, an etapa) or all of
 * what is left. The studio's case: "le hemos cobrado el 50% de anticipo de la Etapa 1".
 *
 * The browser proposes an amount; the SERVER prices it. It re-reads the line, refuses
 * anything above what is left, applies the client's standing discount and converts a
 * dollar price at the month's rate — this dialog's figures are a preview of that, computed
 * with the same floor-the-discount rule so the two agree to the centavo.
 *
 * The cobro's month is the month of its vencimiento: an anticipo belongs to the month it
 * is due, and asking for both invites a cobro dated in one month and due in another.
 */
import { useState } from 'react'
import type { Currency } from '@hold/shared'

import { ApiError } from '@/api/client'
import type { ClientServiceDto } from '@/api/clients'
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
} from '@/app/components/components'
import { DatePicker } from '@/app/components/patterns'
import { todayIso } from '@/app/lib/iso-date'
import { formatAmountSeed, parseAmountInput } from './clients-dialogs'
import { formatMoney } from './cobranza-format'
import { chargeNet, remainingOf, toMinor } from './clients-service-lines-format'

export function ServiceLineChargeDialog({
  line,
  currency,
  discountPercentBp,
  onCharge,
  onClose,
}: {
  line: ClientServiceDto
  currency: Currency
  discountPercentBp: number | null | undefined
  /** Resolves once the server confirmed the cobro; rejects with the server's error. */
  onCharge: (input: { amountMinor: string; period: string; dueDate: string }) => Promise<void>
  onClose: () => void
}) {
  const remaining = remainingOf(line)
  const [amountInput, setAmountInput] = useState(formatAmountSeed(remaining))
  const [dueDate, setDueDate] = useState(todayIso())
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const amount = parseAmountInput(amountInput)
  const tooMuch = amount > remaining
  const { discount, net } = chargeNet(amount, discountPercentBp)
  const valid = amount > 0 && !tooMuch && dueDate !== ''

  async function submit() {
    if (!valid) return
    setPending(true)
    setError(null)
    try {
      await onCharge({ amountMinor: toMinor(amount), period: `${dueDate.slice(0, 7)}-01`, dueDate })
      onClose()
    } catch (err) {
      // The server's refusal is specific ("supera lo que falta cobrar", "falta la
      // cotización del dólar"): show it, never a generic message.
      setError(err instanceof ApiError && err.message ? err.message : 'No pudimos generar el cobro. Probá de nuevo.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open || pending ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cobrar {line.name}</DialogTitle>
          <DialogDescription>
            Falta cobrar {formatMoney(remaining, currency)} de {formatMoney(Number(line.priceMinor) / 100, currency)}.
            Podés cobrar una parte, por ejemplo un anticipo.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="type-caption fg-subtle">Importe a cobrar</span>
            <Input
              type="text"
              inputMode="decimal"
              value={amountInput}
              aria-invalid={tooMuch || undefined}
              onChange={(event) => setAmountInput(event.target.value.replace(/[^\d.,]/g, ''))}
            />
            {tooMuch ? (
              <span className="type-caption fg-danger">
                Supera lo que falta cobrar ({formatMoney(remaining, currency)}).
              </span>
            ) : null}
          </label>
          <div className="flex flex-col gap-1.5">
            <span className="type-caption fg-subtle">Vencimiento</span>
            <DatePicker value={dueDate} onChange={setDueDate} required aria-label="Vencimiento" />
          </div>
          {currency === 'USD' ? (
            <p className="type-body-2 fg-subtle">
              Se cobra en pesos, a la cotización del dólar del mes del vencimiento.
            </p>
          ) : amount > 0 && !tooMuch ? (
            <div className="flex flex-col gap-1 border-t border-alpha-subtle pt-3">
              {discount > 0 ? (
                <div className="flex items-baseline justify-between gap-3">
                  <span className="type-body-2 fg-subtle">Descuento del cliente</span>
                  <span className="type-body-2 tabular-nums fg-default">
                    − {formatMoney(discount, currency)}
                  </span>
                </div>
              ) : null}
              <div className="flex items-baseline justify-between gap-3">
                <span className="type-body-2 fg-subtle">Total del cobro</span>
                <span className="type-mono tabular-nums fg-default">{formatMoney(net, currency)}</span>
              </div>
            </div>
          ) : null}
          {error ? <p className="type-body-2 fg-danger">{error}</p> : null}
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="transparent" color="primary" disabled={pending}>
              Cancelar
            </Button>
          </DialogClose>
          <Button variant="solid" color="primary" disabled={!valid || pending} onClick={submit}>
            {pending ? 'Generando…' : 'Generar cobro'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

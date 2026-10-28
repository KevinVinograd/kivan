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
import { isFutureIso, todayIso } from '@/app/lib/iso-date'
import { formatMoney, formatMonthYear } from './cobranza-format'
import { DetailRow } from './cobranza-detail-ui'
import { paymentMethodLabel } from './pagos-format'
import {
  ACCOUNT_TYPE_LABEL,
  defaultSettlementAccountId,
  settlementDestinationValid,
  useSettlementAccounts,
} from './settlement-accounts'
import type { Payment, PaymentMethod } from './pagos-mock-data'

/** The medios the studio actually uses. `Payment.method` and the API field have existed
 *  since the module shipped, and the register path could never set one — so the pago
 *  detail and the (hidden) Medio column had nothing to show for money already paid. */
const METHOD_OPTIONS: readonly PaymentMethod[] = ['transfer', 'cash', 'mercado_pago', 'other']

/**
 * Registrar pago — record a payment amount against a pago (full or partial). The
 * amount defaults to the outstanding balance and is clamped to it; on submit it
 * persists via `onRegister` (POST /payments/:id/register, which derives the next
 * status atomically). The payment date defaults to today and is sent, mirroring
 * Registrar cobro: a pago is often entered days after the money moved, and letting
 * the server stamp the moment of data entry records a date that never happened.
 * The endpoint has accepted it since it shipped; only the client, the provider and this
 * dialog were missing it.
 *
 * It also asks WHERE the money left from, and how. The account moves the treasury
 * balance server-side in the same transaction — the outgoing half of what keeps the
 * Cashflow Posición honest — and the medio finally reaches a column that has existed,
 * unwritable from here, since the module shipped.
 */
export function PagosRegistrarPagoDialog({
  payment,
  onRegister,
  onClose,
}: {
  payment: Payment
  onRegister: (
    amount: number,
    paymentDate: string,
    treasuryAccountId?: string,
    method?: PaymentMethod,
  ) => Promise<void>
  onClose: () => void
}) {
  const balance = Math.max(payment.totalAmount - payment.paidAmount, 0)
  const [amount, setAmount] = useState<string>(String(balance))
  const [paymentDate, setPaymentDate] = useState<string>(todayIso())
  const [accountId, setAccountId] = useState('')
  const [touchedAccount, setTouchedAccount] = useState(false)
  // Seeded from the pago's own medio when it already carries one (set at creation), so
  // the common case is confirming rather than re-entering.
  const [method, setMethod] = useState<PaymentMethod | ''>(payment.method ?? '')
  const [submitting, setSubmitting] = useState(false)
  const accountsState = useSettlementAccounts()
  const { accounts, status: accountsStatus } = accountsState

  // Preselect only when there is a single account — with several, choosing for the
  // operator would silently decide where the money went.
  useEffect(() => {
    if (!touchedAccount) setAccountId(defaultSettlementAccountId(accounts))
  }, [accounts, touchedAccount])

  const parsed = Number(amount)
  // A future date is rejected rather than clamped: a pago records money that HAS left, so a
  // date ahead of today is a mistyped year, and it rides into the cuenta corriente and every
  // figure that reads "paid by" a date.
  const dateValid = paymentDate !== '' && !isFutureIso(paymentDate)
  // Every lane settles from an account. The carve-out this used to carry was for FCI,
  // which is gone: a Fondo Común is an ACCOUNT, not a currency, so there is no lane left
  // whose money moves without a balance moving with it.
  const accountValid = settlementDestinationValid(accountsState, accountId)
  const valid =
    Number.isFinite(parsed) && parsed > 0 && parsed <= balance && dateValid && accountValid

  async function handleRegister() {
    if (!valid || submitting) return
    setSubmitting(true)
    try {
      await onRegister(
        parsed,
        paymentDate,
        accountId || undefined,
        method || undefined,
      )
      toast.success(parsed >= balance ? 'Pago registrado' : 'Pago parcial registrado')
      onClose()
    } catch {
      toast.error('No se pudo registrar el pago')
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar pago</DialogTitle>
          <DialogDescription>
            {payment.recipientName} · {formatMonthYear(payment.period)}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <DetailRow label="Monto" value={formatMoney(payment.totalAmount, payment.currency)} />
            <DetailRow label="Pagado" value={formatMoney(payment.paidAmount, payment.currency)} />
            <DetailRow label="Saldo" value={formatMoney(balance, payment.currency)} />
          </div>
          {balance > 0 ? (
            <label className="flex flex-col gap-1.5">
              <span className="type-caption fg-subtle">Monto a pagar</span>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={balance}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                aria-label="Monto a pagar"
              />
            </label>
          ) : (
            <p className="type-body-2 fg-subtle">Este pago ya está saldado.</p>
          )}
          {balance > 0 ? (
            <label className="flex flex-col gap-1.5">
              <span className="type-caption fg-subtle">Fecha de pago</span>
              <DatePicker value={paymentDate} onChange={setPaymentDate} required aria-label="Fecha de pago" />
              {isFutureIso(paymentDate) ? (
                <span role="alert" className="type-caption fg-danger">
                  La fecha no puede ser posterior a hoy
                </span>
              ) : null}
            </label>
          ) : null}
          {balance > 0 ? (
            <label className="flex flex-col gap-1.5">
              {/* "Cuenta de origen", not "Medio de pago" — this dialog had TWO adjacent
                  selects under the identical label, and only THIS one moves a treasury
                  balance. The other one records how it was paid and moves nothing. An
                  operator reconciling against the bank had no way to tell which was
                  which. Two controls sharing one accessible name is also an a11y
                  defect: a screen reader announced them identically. */}
              <span className="type-caption fg-subtle">Cuenta de origen</span>
              <Select
                value={accountId}
                onValueChange={(next) => {
                  setTouchedAccount(true)
                  setAccountId(next)
                }}
                disabled={accounts.length === 0}
              >
                <SelectTrigger className="w-full" aria-label="Cuenta de origen">
                  <SelectValue
                    placeholder={
                      accountsStatus === 'loading'
                        ? 'Cargando cuentas'
                        : accountsStatus === 'error'
                          ? 'No se pudieron cargar'
                          : accounts.length === 0
                            ? 'Sin cuentas cargadas'
                            : 'Elegí la cuenta'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.name} · {ACCOUNT_TYPE_LABEL[account.type] ?? account.type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {accountsStatus === 'error' ? (
                <span className="type-caption fg-danger">
                  No se pudieron cargar las cuentas, volvé a abrir el formulario
                </span>
              ) : accounts.length === 0 ? (
                <span className="type-caption fg-subtle">
                  Cargá tus cuentas en Cashflow para que el saldo se actualice solo
                </span>
              ) : (
                <span className="type-caption fg-subtle">
                  El saldo de esa cuenta baja con este pago
                </span>
              )}
            </label>
          ) : null}
          {balance > 0 ? (
            <label className="flex flex-col gap-1.5">
              <span className="type-caption fg-subtle">Medio de pago</span>
              <Select value={method} onValueChange={(next) => setMethod(next as PaymentMethod)}>
                <SelectTrigger className="w-full" aria-label="Medio de pago">
                  <SelectValue placeholder="Opcional" />
                </SelectTrigger>
                <SelectContent>
                  {METHOD_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {paymentMethodLabel(option)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
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
            onClick={handleRegister}
          >
            Registrar pago
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

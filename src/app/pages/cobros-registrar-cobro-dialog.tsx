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
import {
  ACCOUNT_TYPE_LABEL,
  defaultSettlementAccountId,
  settlementDestinationValid,
  useSettlementAccounts,
} from './settlement-accounts'
import type { Receivable } from './cobros-mock-data'

export function CobrosRegistrarCobroDialog({
  receivable,
  onCollect,
  onClose,
}: {
  receivable: Receivable
  onCollect: (amount: number, collectedAt: string, treasuryAccountId?: string) => Promise<void>
  onClose: () => void
}) {
  const balance = Math.max(receivable.totalAmount - receivable.collectedAmount, 0)
  const [amount, setAmount] = useState<string>(String(balance))
  const [collectedAt, setCollectedAt] = useState<string>(todayIso())
  const [accountId, setAccountId] = useState('')
  const [touchedAccount, setTouchedAccount] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const accountsState = useSettlementAccounts()
  const { accounts, status: accountsStatus } = accountsState

  useEffect(() => {
    if (!touchedAccount) setAccountId(defaultSettlementAccountId(accounts))
  }, [accounts, touchedAccount])

  const parsed = Number(amount)
  const dateValid = collectedAt !== '' && !isFutureIso(collectedAt)
  const accountValid = settlementDestinationValid(accountsState, accountId)
  const valid =
    Number.isFinite(parsed) && parsed > 0 && parsed <= balance && dateValid && accountValid

  async function handleRegister() {
    if (!valid || submitting) return
    setSubmitting(true)
    try {
      await onCollect(parsed, collectedAt, accountId || undefined)
      toast.success(parsed >= balance ? 'Cobro registrado' : 'Cobro parcial registrado')
      onClose()
    } catch {
      toast.error('No se pudo registrar el cobro')
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar cobro</DialogTitle>
          <DialogDescription>
            {receivable.clientName} · {formatMonthYear(receivable.period)}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <DetailRow label="Total" value={formatMoney(receivable.totalAmount, receivable.currency)} />
            <DetailRow
              label="Cobrado"
              value={formatMoney(receivable.collectedAmount, receivable.currency)}
            />
            <DetailRow label="Saldo" value={formatMoney(balance, receivable.currency)} />
          </div>
          {balance > 0 ? (
            <label className="flex flex-col gap-1.5">
              <span className="type-caption fg-subtle">Monto a cobrar</span>
              <Input
                type="number"
                inputMode="numeric"
                min={0}
                max={balance}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                aria-label="Monto a cobrar"
              />
            </label>
          ) : (
            <p className="type-body-2 fg-subtle">Este cobro ya está saldado.</p>
          )}
          {balance > 0 ? (
            <label className="flex flex-col gap-1.5">
              <span className="type-caption fg-subtle">Fecha de cobro</span>
              <DatePicker value={collectedAt} onChange={setCollectedAt} required aria-label="Fecha de cobro" />
              {isFutureIso(collectedAt) ? (
                <span role="alert" className="type-caption fg-danger">
                  La fecha no puede ser posterior a hoy
                </span>
              ) : null}
            </label>
          ) : null}
          {balance > 0 ? (
            <label className="flex flex-col gap-1.5">
              <span className="type-caption fg-subtle">Medio de pago</span>
              <Select
                value={accountId}
                onValueChange={(next) => {
                  setTouchedAccount(true)
                  setAccountId(next)
                }}
                disabled={accounts.length === 0}
              >
                <SelectTrigger className="w-full" aria-label="Medio de pago">
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
                  El saldo de esa cuenta sube con este cobro
                </span>
              )}
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
            Registrar cobro
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

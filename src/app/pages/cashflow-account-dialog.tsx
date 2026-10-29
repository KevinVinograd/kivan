import { useState, type ReactNode } from 'react'

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
  Switch,
  toast,
} from '@/app/components/components'
import type { Account, Currency, Money, Partner } from './treasury-mock-data'
import { CURRENCIES } from './treasury-position'
import { ACCOUNT_TYPE_LABEL, LANE_LABEL, PARTNER_LABEL } from './treasury-position-view'
import { KeepOpenToggle, useKeepOpen } from './dialog-keep-open'

type AccountType = Account['type']

const PARTNER_OPTIONS: Partner[] = ['vicky', 'flor', 'more', 'shared']
const TYPE_OPTIONS: AccountType[] = ['bank', 'cash', 'investment']

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="type-caption fg-subtle">{label}</span>
      {children}
    </label>
  )
}

type CashflowAccountDialogProps = { onClose: () => void } & (
  | { account: Account; onSave: (next: Account) => Promise<void>; onCreate?: never }
  | { account?: undefined; onCreate: (next: Omit<Account, 'id'>) => Promise<void>; onSave?: never }
)

export function CashflowAccountDialog(props: CashflowAccountDialogProps) {
  const { account, onClose } = props
  const [name, setName] = useState(account?.name ?? '')
  const [partner, setPartner] = useState<Partner>(account?.partner ?? 'shared')
  const [type, setType] = useState<AccountType>(account?.type ?? 'bank')
  const [isReserve, setIsReserve] = useState(account?.isReserve ?? false)
  const [note, setNote] = useState(account?.note ?? '')
  const [isActive, setIsActive] = useState(account?.isActive ?? true)
  const [submitting, setSubmitting] = useState(false)
  const { keepOpen, setKeepOpen, fieldsRef, focusFirstField } = useKeepOpen()
  const [balances, setBalances] = useState<Record<Currency, string>>(() => ({
    ARS: account?.balances.ARS != null ? String(account.balances.ARS) : '',
    USD: account?.balances.USD != null ? String(account.balances.USD) : '',
  }))

  const lanesValid = CURRENCIES.every(
    (currency) => balances[currency].trim() === '' || Number.isFinite(Number(balances[currency])),
  )
  const valid = name.trim().length > 0 && lanesValid

  async function handleSubmit() {
    if (!valid || submitting) return
    const money: Money = {}
    for (const currency of CURRENCIES) {
      const raw = balances[currency].trim()
      if (raw !== '' && Number.isFinite(Number(raw))) money[currency] = Number(raw)
    }
    const base = {
      name: name.trim(),
      partner,
      type,
      balances: money,
      isReserve: isReserve || undefined,
      note: note.trim() || undefined,
      isActive,
    }
    setSubmitting(true)
    try {
      if (props.account) {
        await props.onSave({ ...props.account, ...base })
        toast.success('Cuenta actualizada')
      } else {
        await props.onCreate(base)
        toast.success('Cuenta agregada')
        if (keepOpen) {
          setName('')
          setNote('')
          setIsReserve(false)
          setBalances({ ARS: '', USD: '' })
          setSubmitting(false)
          focusFirstField('Nombre')
          return
        }
      }
      onClose()
    } catch {
      toast.error('No se pudo guardar la cuenta')
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{account ? 'Editar cuenta' : 'Nueva cuenta'}</DialogTitle>
          <DialogDescription>
            Cuenta de tesorería con saldos por moneda. Las cuentas de reserva suman a Finanzas Hold.
          </DialogDescription>
        </DialogHeader>

        <div ref={fieldsRef} className="flex flex-col gap-3">
          <Field label="Nombre">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              aria-label="Nombre"
            />
          </Field>

          <div className="grid grid-cols-2 gap-2">
            <Field label="Socia">
              <Select value={partner} onValueChange={(value) => setPartner(value as Partner)}>
                <SelectTrigger className="w-full" aria-label="Socia">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PARTNER_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {PARTNER_LABEL[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Tipo">
              <Select value={type} onValueChange={(value) => setType(value as AccountType)}>
                <SelectTrigger className="w-full" aria-label="Tipo">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {ACCOUNT_TYPE_LABEL[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {CURRENCIES.map((currency) => (
              <Field key={currency} label={`Saldo ${LANE_LABEL[currency]}`}>
                <Input
                  type="number"
                  value={balances[currency]}
                  onChange={(event) =>
                    setBalances((prev) => ({ ...prev, [currency]: event.target.value }))
                  }
                  aria-label={`Saldo ${LANE_LABEL[currency]}`}
                />
              </Field>
            ))}
          </div>

          <Field label="Observaciones (opcional)">
            <Input value={note} onChange={(event) => setNote(event.target.value)} aria-label="Observaciones" />
          </Field>

          <label className="flex items-center justify-between gap-4">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="type-body-2 fg-default">Cuenta de reserva</span>
              <span className="type-caption fg-subtle">Suma a Finanzas Hold en vez de a los saldos operativos.</span>
            </span>
            <Switch checked={isReserve} onCheckedChange={setIsReserve} className="shrink-0" />
          </label>

          <label className="flex items-center justify-between gap-4">
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="type-body-2 fg-default">Activa</span>
              <span className="type-caption fg-subtle">Incluir esta cuenta en la posición.</span>
            </span>
            <Switch checked={isActive} onCheckedChange={setIsActive} className="shrink-0" />
          </label>
        </div>

        <DialogFooter>
          {account ? null : <KeepOpenToggle checked={keepOpen} onCheckedChange={setKeepOpen} />}
          <Button variant="outlined" color="primary" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            variant="solid"
            color="primary"
            disabled={!valid || submitting}
            onClick={handleSubmit}
          >
            {account ? 'Guardar cambios' : 'Agregar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

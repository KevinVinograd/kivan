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

/** Caption label stacked over a control, matching the finance dialog idiom. */
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="type-caption fg-subtle">{label}</span>
      {children}
    </label>
  )
}

/**
 * Add / edit a treasury account. `account` present → edit (returns the full
 * `Account` via `onSave`); absent → create (returns `Omit<Account, 'id'>` via
 * `onCreate`, the store mints the id). Balances are entered per currency lane
 * (ARS / USD); a blank lane is omitted from the account's `Money`.
 */
/**
 * The two modes are mutually exclusive, and the type says so — the same shape
 * `cashflow-commitment-dialog.tsx` uses, for the same reason. Requiring both handlers
 * meant every call site passed one that could never fire: `submit` reaches `onCreate`
 * only when `account` is absent and `onSave` only when it is present. Discriminating on
 * `account` makes the compiler ask for exactly the handler the mode can reach, which is
 * what lets the header launcher open this in create mode without inventing a dead
 * `onSave`.
 */
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
      // Narrowed on `props`, not the destructured `account`: the union lives on the props
      // object, so this is what proves to TS that the handler for this mode exists.
      if (props.account) {
        await props.onSave({ ...props.account, ...base })
        toast.success('Cuenta actualizada')
      } else {
        await props.onCreate(base)
        toast.success('Cuenta agregada')
        // Only after the write landed. `isReserve` clears too, and that one is not
        // cosmetic: it decides whether the balance counts as operating cash or as wealth,
        // so a sticky tick would silently drop the NEXT account into the reserve bucket and
        // move both the Posición and the projection opening. Partner and type stay — those
        // a batch genuinely shares, and getting them wrong is visible on the row.
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
            {/* NO `maxLength`, deliberately. `updateAccountSchema` caps `note` at 500 and
                this dialog resubmits it on every save, so an over-long note does block
                saving the balance and the name — but `maxLength` answers that by silently
                truncating a paste and then reporting success, which is the write-honesty
                failure this repo ratchets against: 200 characters gone and a green toast.
                A loud 400 loses nothing. The real fix is surfacing the server's reason on
                the field, which is the `catch {}` below and the same shape as the other
                sites WF004 tracks. Migration 0028 stays well clear of the cap on its own
                side (460), so it cannot be what puts an account in that state. */}
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
          {/* Create only: "seguir agregando" has no meaning when you are editing one row. */}
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

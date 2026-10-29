import { useEffect, useState } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Checkbox,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Dialog,
  DialogClose,
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
import { ICON } from '@/app/lib/icon-registry'
import type { BankData, ClientMonth, TeamPayout } from './monthly-operation-mock-data'
import {
  clientTotalToBill,
  formatCurrency,
  nextStatementAction,
  payoutTotal,
  type StatementTransition,
} from './monthly-operation-format'
import { isFutureIso, todayIso } from '@/app/lib/iso-date'
import { useMonthlyOperation } from './monthly-operation-data'
import {
  ACCOUNT_TYPE_LABEL,
  defaultSettlementAccountId,
  settlementDestinationValid,
  useSettlementAccounts,
} from './settlement-accounts'

export type MonthlyDialogState =
  | { kind: 'none' }
  | { kind: 'client-payment'; client: ClientMonth }
  | { kind: 'client-extra'; client: ClientMonth; adjustment: boolean }
  | { kind: 'client-note'; client: ClientMonth }
  | { kind: 'team-payout'; payout: TeamPayout }
  | { kind: 'team-adjustment'; payout: TeamPayout }
  | { kind: 'team-bank'; payout: TeamPayout }
  | { kind: 'team-statement'; payout: TeamPayout }
  | { kind: 'team-statement-bulk' }
  | { kind: 'client-effective-date'; client: ClientMonth }
  | { kind: 'pick-client-payment' }
  | { kind: 'pick-team-payout' }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="type-caption fg-subtle">{label}</span>
      {children}
    </label>
  )
}

function ClientPaymentDialog({ client, onClose }: { client: ClientMonth; onClose: () => void }) {
  const op = useMonthlyOperation()
  const pending = Math.max(clientTotalToBill(client) - client.paidAmount, 0)
  const [amount, setAmount] = useState(pending)
  const [date, setDate] = useState(todayIso)
  const [accountId, setAccountId] = useState('')
  const [touchedAccount, setTouchedAccount] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const accountsState = useSettlementAccounts()
  const { accounts, status: accountsStatus } = accountsState

  useEffect(() => {
    if (!touchedAccount) setAccountId(defaultSettlementAccountId(accounts))
  }, [accounts, touchedAccount])

  const accountValid = settlementDestinationValid(accountsState, accountId)
  const canSubmit = amount > 0 && Boolean(date) && !isFutureIso(date) && accountValid && !submitting
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault()
            if (!canSubmit) return
            setSubmitting(true)
            if (
              !(await op.registerClientPayment(
                client.id,
                amount,
                date,
                accountId || undefined,
              ))
            ) {
              setSubmitting(false)
              return
            }
            toast.success('Cobro registrado')
            onClose()
          }}
        >
          <DialogHeader>
            <DialogTitle>Registrar cobro</DialogTitle>
            <DialogDescription>
              {client.name} · Pendiente {formatCurrency(pending)}
            </DialogDescription>
          </DialogHeader>
          <Field label="Monto cobrado (ARS)">
            <Input
              type="number"
              min={0}
              max={pending}
              value={amount}
              onChange={(event) => setAmount(Math.min(Number(event.target.value) || 0, pending))}
              autoFocus
            />
          </Field>
          <Field label="Fecha de cobro">
            <DatePicker value={date} onChange={setDate} required aria-label="Fecha de cobro" />
            {isFutureIso(date) ? (
              <span role="alert" className="type-caption fg-danger">
                La fecha no puede ser posterior a hoy
              </span>
            ) : null}
          </Field>
          <Field label="Medio de pago">
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
            ) : null}
          </Field>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outlined" color="primary">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" variant="solid" color="primary" disabled={!canSubmit}>
              Registrar cobro
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ClientExtraDialog({
  client,
  adjustment,
  onClose,
}: {
  client: ClientMonth
  adjustment: boolean
  onClose: () => void
}) {
  const op = useMonthlyOperation()
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState(0)
  const [billable, setBillable] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const title = adjustment ? 'Agregar ajuste' : 'Agregar extra'
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault()
            if (submitting) return
            setSubmitting(true)
            if (!(await op.addClientExtra(client.id, { description, amount, billable }))) {
              setSubmitting(false)
              return
            }
            toast.success(adjustment ? 'Ajuste agregado' : 'Extra agregado')
            onClose()
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>
              {client.name} · {adjustment ? 'Ajuste sobre el total a facturar' : 'Trabajo fuera de scope'}
            </DialogDescription>
          </DialogHeader>
          <Field label="Descripción">
            <Input value={description} onChange={(event) => setDescription(event.target.value)} required autoFocus />
          </Field>
          <Field label="Monto (ARS)">
            <Input
              type="number"
              value={amount}
              onChange={(event) => setAmount(Number(event.target.value) || 0)}
            />
          </Field>
          <label className="flex items-center gap-2 type-body-2 fg-default">
            <Checkbox checked={billable} onCheckedChange={(checked) => setBillable(!!checked)} />
            Facturable al cliente
          </label>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outlined" color="primary">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" variant="solid" color="primary" disabled={!description.trim() || submitting}>
              {title}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ClientNoteDialog({ client, onClose }: { client: ClientMonth; onClose: () => void }) {
  const op = useMonthlyOperation()
  const [note, setNote] = useState(client.notes ?? '')
  const [submitting, setSubmitting] = useState(false)
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault()
            if (submitting) return
            setSubmitting(true)
            if (!(await op.setClientNote(client.id, note))) {
              setSubmitting(false)
              return
            }
            toast.success('Nota guardada')
            onClose()
          }}
        >
          <DialogHeader>
            <DialogTitle>Agregar nota</DialogTitle>
            <DialogDescription>{client.name}</DialogDescription>
          </DialogHeader>
          <Field label="Nota">
            <Textarea value={note} onChange={(event) => setNote(event.target.value)} className="min-h-32" autoFocus />
          </Field>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outlined" color="primary">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" variant="solid" color="primary" disabled={submitting}>
              Guardar nota
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function TeamPayoutDialog({ payout, onClose }: { payout: TeamPayout; onClose: () => void }) {
  const op = useMonthlyOperation()
  const pending = Math.max(payoutTotal(payout) - payout.paidAmount, 0)
  const [amount, setAmount] = useState(pending)
  const [date, setDate] = useState(todayIso)
  const [accountId, setAccountId] = useState('')
  const [touchedAccount, setTouchedAccount] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const accountsState = useSettlementAccounts()
  const { accounts, status: accountsStatus } = accountsState

  useEffect(() => {
    if (!touchedAccount) setAccountId(defaultSettlementAccountId(accounts))
  }, [accounts, touchedAccount])

  const accountValid = settlementDestinationValid(accountsState, accountId)
  const canSubmit = amount > 0 && Boolean(date) && !isFutureIso(date) && accountValid && !submitting
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault()
            if (!canSubmit) return
            setSubmitting(true)
            if (!(await op.registerPayout(payout.id, amount, date, accountId || undefined))) {
              setSubmitting(false)
              return
            }
            toast.success('Pago registrado')
            onClose()
          }}
        >
          <DialogHeader>
            <DialogTitle>Registrar pago</DialogTitle>
            <DialogDescription>
              {payout.name} · Pendiente {formatCurrency(pending)}
            </DialogDescription>
          </DialogHeader>
          <Field label="Monto pagado (ARS)">
            <Input
              type="number"
              min={0}
              max={pending}
              value={amount}
              onChange={(event) => setAmount(Math.min(Number(event.target.value) || 0, pending))}
              autoFocus
            />
          </Field>
          <Field label="Fecha de pago">
            <DatePicker value={date} onChange={setDate} required aria-label="Fecha de pago" />
            {isFutureIso(date) ? (
              <span role="alert" className="type-caption fg-danger">
                La fecha no puede ser posterior a hoy
              </span>
            ) : null}
          </Field>
          <Field label="Medio de pago">
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
            ) : null}
          </Field>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outlined" color="primary">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" variant="solid" color="primary" disabled={!canSubmit}>
              Registrar pago
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function TeamAdjustmentDialog({ payout, onClose }: { payout: TeamPayout; onClose: () => void }) {
  const op = useMonthlyOperation()
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault()
            if (submitting) return
            setSubmitting(true)
            if (!(await op.addAdjustment(payout.id, { description, amount }))) {
              setSubmitting(false)
              return
            }
            toast.success('Ajuste agregado')
            onClose()
          }}
        >
          <DialogHeader>
            <DialogTitle>Agregar ajuste</DialogTitle>
            <DialogDescription>{payout.name} · Suma o resta al total a pagar</DialogDescription>
          </DialogHeader>
          <Field label="Descripción">
            <Input value={description} onChange={(event) => setDescription(event.target.value)} required autoFocus />
          </Field>
          <Field label="Monto (ARS)">
            <Input type="number" value={amount} onChange={(event) => setAmount(Number(event.target.value) || 0)} />
          </Field>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outlined" color="primary">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" variant="solid" color="primary" disabled={!description.trim() || submitting}>
              Agregar ajuste
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function TeamBankDialog({ payout, onClose }: { payout: TeamPayout; onClose: () => void }) {
  const op = useMonthlyOperation()
  const [bank, setBank] = useState<BankData>({
    bankName: payout.bank?.bankName ?? '',
    accountHolder: payout.bank?.accountHolder ?? '',
    cbuOrCvu: payout.bank?.cbuOrCvu ?? '',
    alias: payout.bank?.alias ?? '',
  })
  const [submitting, setSubmitting] = useState(false)
  function update<K extends keyof BankData>(key: K, value: string) {
    setBank((prev) => ({ ...prev, [key]: value }))
  }
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault()
            if (submitting) return
            setSubmitting(true)
            if (
              !(await op.setBankData(payout.id, {
                bankName: bank.bankName || undefined,
                accountHolder: bank.accountHolder || undefined,
                cbuOrCvu: bank.cbuOrCvu || undefined,
                alias: bank.alias || undefined,
              }))
            ) {
              setSubmitting(false)
              return
            }
            toast.success('Datos bancarios actualizados')
            onClose()
          }}
        >
          <DialogHeader>
            <DialogTitle>Editar datos bancarios</DialogTitle>
            <DialogDescription>{payout.name}</DialogDescription>
          </DialogHeader>
          <Field label="Banco">
            <Input value={bank.bankName} onChange={(event) => update('bankName', event.target.value)} />
          </Field>
          <Field label="Titular">
            <Input value={bank.accountHolder} onChange={(event) => update('accountHolder', event.target.value)} />
          </Field>
          <Field label="CBU / CVU">
            <Input value={bank.cbuOrCvu} onChange={(event) => update('cbuOrCvu', event.target.value)} />
          </Field>
          <Field label="Alias">
            <Input value={bank.alias} onChange={(event) => update('alias', event.target.value)} />
          </Field>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outlined" color="primary">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" variant="solid" color="primary" disabled={submitting}>
              Guardar datos
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ClientPaymentPicker({
  onPick,
  onClose,
}: {
  onPick: (client: ClientMonth) => void
  onClose: () => void
}) {
  const op = useMonthlyOperation()
  return (
    <CommandDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title="Registrar cobro"
      description="Elegí el cliente para registrar el cobro"
    >
      <CommandInput placeholder="Buscar cliente" />
      <CommandList>
        <CommandEmpty>No hay clientes en este mes</CommandEmpty>
        <CommandGroup heading="Clientes">
          {op.data.clients.map((client) => {
            const pending = Math.max(clientTotalToBill(client) - client.paidAmount, 0)
            return (
              <CommandItem key={client.id} value={client.name} onSelect={() => onPick(client)}>
                <ICON.clients aria-hidden />
                <span className="flex-1 truncate">{client.name}</span>
                <span className="type-caption fg-subtle">Pendiente {formatCurrency(pending)}</span>
              </CommandItem>
            )
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}

function TeamPayoutPicker({
  onPick,
  onClose,
}: {
  onPick: (payout: TeamPayout) => void
  onClose: () => void
}) {
  const op = useMonthlyOperation()
  return (
    <CommandDialog
      open
      onOpenChange={(open) => (open ? undefined : onClose())}
      title="Registrar pago al equipo"
      description="Elegí a la persona para registrar el pago"
    >
      <CommandInput placeholder="Buscar persona" />
      <CommandList>
        <CommandEmpty>No hay pagos en este mes</CommandEmpty>
        <CommandGroup heading="Equipo">
          {op.data.team.map((payout) => {
            const pending = Math.max(payoutTotal(payout) - payout.paidAmount, 0)
            return (
              <CommandItem key={payout.id} value={payout.name} onSelect={() => onPick(payout)}>
                <ICON.team aria-hidden />
                <span className="flex-1 truncate">{payout.name}</span>
                <span className="type-caption fg-subtle">Pendiente {formatCurrency(pending)}</span>
              </CommandItem>
            )
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}

function ClientEffectiveDateDialog({ client, onClose }: { client: ClientMonth; onClose: () => void }) {
  const op = useMonthlyOperation()
  const isChurn = client.monthStatus === 'churned'
  const [date, setDate] = useState(() => client.effectiveDate ?? todayIso())
  const [submitting, setSubmitting] = useState(false)
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <form
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault()
            if (submitting) return
            setSubmitting(true)
            if (!(await op.setClientEffectiveDate(client.id, date))) {
              setSubmitting(false)
              return
            }
            toast.success('Fecha efectiva guardada')
            onClose()
          }}
        >
          <DialogHeader>
            <DialogTitle>Definir fecha efectiva</DialogTitle>
            <DialogDescription>
              {client.name} · {isChurn ? 'Baja del mes' : 'Alta del mes'}
            </DialogDescription>
          </DialogHeader>
          <Field label="Fecha efectiva">
            <DatePicker value={date} onChange={setDate} required aria-label="Fecha efectiva" />
          </Field>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outlined" color="primary">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" variant="solid" color="primary" disabled={!date || submitting}>
              Guardar fecha
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

const STATEMENT_TRANSITION_COPY: Record<
  StatementTransition,
  { title: string; description: string; success: string }
> = {
  approve: {
    title: 'Aprobar cuenta corriente',
    description: 'Queda aprobada para pagar y deja de bloquear el cierre del mes',
    success: 'Cuenta corriente aprobada',
  },
  dispatch: {
    title: 'Marcar el pago como enviado',
    description: 'Registra que el pago salió. La transferencia se hace por fuera del sistema',
    success: 'Pago marcado como enviado',
  },
  confirm: {
    title: 'Confirmar el pago',
    description: 'Confirma que el dinero llegó. Es el último paso del ciclo y no se puede revertir',
    success: 'Pago confirmado',
  },
}

function StatementTransitionDialog({ payout, onClose }: { payout: TeamPayout; onClose: () => void }) {
  const op = useMonthlyOperation()
  const [submitting, setSubmitting] = useState(false)
  const advance = nextStatementAction(payout.statementStatus)
  if (!advance) return null
  const copy = STATEMENT_TRANSITION_COPY[advance.transition]

  const run = async () => {
    if (submitting) return
    setSubmitting(true)
    const ok =
      advance.transition === 'approve'
        ? await op.approveStatement(payout.id)
        : advance.transition === 'dispatch'
          ? await op.dispatchStatement(payout.id)
          : await op.confirmStatement(payout.id)
    if (!ok) {
      setSubmitting(false)
      return
    }
    toast.success(copy.success)
    onClose()
  }

  return (
    <AlertDialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{copy.title}</AlertDialogTitle>
          <AlertDialogDescription>
            {payout.name}, {formatCurrency(payoutTotal(payout))}. {copy.description}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={submitting}
            onClick={(event) => {
              event.preventDefault()
              void run()
            }}
          >
            {advance.label}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

const statementCount = (count: number): string =>
  count === 1 ? '1 cuenta corriente' : `${count} cuentas corrientes`

function BulkApproveStatementsDialog({ onClose }: { onClose: () => void }) {
  const op = useMonthlyOperation()
  const [submitting, setSubmitting] = useState(false)
  const drafts = op.data.team.filter((payout) => payout.statementStatus === 'draft')

  const run = async () => {
    if (submitting) return
    setSubmitting(true)
    const { approved, failed } = await op.approveDraftStatements()
    if (approved === 0) {
      toast.error('No se pudo aprobar ninguna cuenta corriente')
      setSubmitting(false)
      return
    }
    if (failed > 0) {
      toast.warning(`${approved} de ${approved + failed} cuentas corrientes aprobadas`)
    } else {
      toast.success(`${statementCount(approved)} ${approved === 1 ? 'aprobada' : 'aprobadas'}`)
    }
    onClose()
  }

  return (
    <AlertDialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Aprobar cuentas corrientes</AlertDialogTitle>
          <AlertDialogDescription>
            {drafts.length === 0
              ? 'No queda ninguna cuenta corriente sin aprobar en este mes.'
              : `Se van a aprobar ${statementCount(drafts.length)} sin aprobar. Las que ya están aprobadas, enviadas o confirmadas no se tocan.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={submitting || drafts.length === 0}
            onClick={(event) => {
              event.preventDefault()
              void run()
            }}
          >
            Aprobar {drafts.length}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function MonthlyOperationDialogs({
  state,
  onClose,
  onPick,
}: {
  state: MonthlyDialogState
  onClose: () => void
  onPick: (next: MonthlyDialogState) => void
}) {
  switch (state.kind) {
    case 'client-payment':
      return <ClientPaymentDialog client={state.client} onClose={onClose} />
    case 'client-extra':
      return <ClientExtraDialog client={state.client} adjustment={state.adjustment} onClose={onClose} />
    case 'client-note':
      return <ClientNoteDialog client={state.client} onClose={onClose} />
    case 'client-effective-date':
      return <ClientEffectiveDateDialog client={state.client} onClose={onClose} />
    case 'team-payout':
      return <TeamPayoutDialog payout={state.payout} onClose={onClose} />
    case 'team-adjustment':
      return <TeamAdjustmentDialog payout={state.payout} onClose={onClose} />
    case 'team-bank':
      return <TeamBankDialog payout={state.payout} onClose={onClose} />
    case 'team-statement':
      return <StatementTransitionDialog payout={state.payout} onClose={onClose} />
    case 'team-statement-bulk':
      return <BulkApproveStatementsDialog onClose={onClose} />
    case 'pick-client-payment':
      return (
        <ClientPaymentPicker
          onPick={(client) => onPick({ kind: 'client-payment', client })}
          onClose={onClose}
        />
      )
    case 'pick-team-payout':
      return (
        <TeamPayoutPicker
          onPick={(payout) => onPick({ kind: 'team-payout', payout })}
          onClose={onClose}
        />
      )
    default:
      return null
  }
}

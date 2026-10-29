import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'

import { cn } from '@/app/lib/utils'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  buttonVariants,
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
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
import { DataTable, Toolbar } from '@/app/components/patterns'
import { AFFORDANCE, ICON } from '@/app/lib/icon-registry'
import { useMonthlyRules } from './monthly-rules-data'
import type {
  ExpenseCategory,
  ExpensePayStatus,
  ExpenseRecurrence,
  FixedExpense,
  MonthPayment,
  MonthPaymentRecipient,
  Monotributo,
} from './monthly-operation-mock-data'
import {
  EXPENSE_CATEGORY_LABEL,
  EXPENSE_RECURRENCE_LABEL,
  MONOTRIBUTO_FULL_LABEL,
  NO_REGISTRO,
  NO_VALUE,
  expensePayBadge,
  formatCurrency,
  formatDate,
} from './monthly-operation-format'
import { useMonthlyOperation, type ExpenseInput } from './monthly-operation-data'

export type ExpenseRowActions = {
  onEdit: (expense: FixedExpense) => void
  onDelete: (expense: FixedExpense) => void
}

function expenseColumns(actions: ExpenseRowActions, locked: boolean): ColumnDef<FixedExpense>[] {
  return [
    {
      accessorKey: 'concept',
      id: 'concept',
      header: 'Gasto',
      meta: { mobile: 'title' },
      cell: ({ row }) => <span className="type-button fg-default">{row.original.concept}</span>,
    },
    {
      id: 'category',
      header: 'Categoría',
      accessorFn: (e) => e.category,
      cell: ({ row }) => (
        <span className="fg-default">
          {EXPENSE_CATEGORY_LABEL[row.original.category as ExpenseCategory] ?? row.original.category}
        </span>
      ),
    },
    {
      accessorKey: 'amount',
      id: 'amount',
      header: 'Monto',
      meta: { mobile: 'secondary' },
      cell: ({ row }) => <span className="tabular-nums fg-default">{formatCurrency(row.original.amount)}</span>,
    },
    {
      id: 'recurrence',
      header: 'Recurrencia',
      accessorFn: (e) => e.recurrence,
      cell: ({ row }) => <span className="fg-default">{EXPENSE_RECURRENCE_LABEL[row.original.recurrence]}</span>,
    },
    {
      accessorKey: 'responsible',
      id: 'responsible',
      header: 'Responsable/proveedor',
      cell: ({ row }) => (
        <span className={row.original.responsible ? 'fg-default' : 'fg-subtle'}>
          {row.original.responsible ?? NO_VALUE}
        </span>
      ),
    },
    {
      id: 'monotributo',
      header: 'Monotributo asociado',
      accessorFn: (e) => e.monotributo ?? 'z',
      cell: ({ row }) => (
        <span className={row.original.monotributo ? 'fg-default' : 'fg-subtle'}>
          {row.original.monotributo ? MONOTRIBUTO_FULL_LABEL[row.original.monotributo] : NO_VALUE}
        </span>
      ),
    },
    {
      id: 'payStatus',
      header: 'Estado de pago',
      meta: { mobile: 'badge' },
      accessorFn: (e) => e.payStatus,
      cell: ({ row }) => {
        const badge = expensePayBadge(row.original.payStatus)
        return <Badge variant={badge.variant}>{badge.label}</Badge>
      },
    },
    {
      id: 'affectsProfitability',
      header: 'Impacta rentabilidad',
      accessorFn: (e) => (e.affectsProfitability ? 1 : 0),
      cell: ({ row }) => (
        <Badge variant={row.original.affectsProfitability ? 'warning' : 'neutral'}>
          {row.original.affectsProfitability ? 'Sí' : 'No'}
        </Badge>
      ),
    },
    {
      accessorKey: 'notes',
      id: 'notes',
      header: 'Notas',
      enableSorting: false,
      cell: ({ row }) => (
        <span className={row.original.notes ? 'fg-default' : 'fg-subtle'}>{row.original.notes ?? NO_VALUE}</span>
      ),
    },
    {
      id: 'actions',
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const expense = row.original
        return (
          <div className="flex justify-end" onClick={(event) => event.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Acciones del gasto"
                className={cn(buttonVariants({ variant: 'transparent', color: 'primary' }), 'size-8 shrink-0')}
              >
                <AFFORDANCE.overflow className="size-4" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem disabled={locked} onSelect={() => actions.onEdit(expense)}>
                  <ICON.edit aria-hidden />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled={locked} variant="destructive" onSelect={() => actions.onDelete(expense)}>
                  <ICON.delete aria-hidden />
                  Eliminar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      },
    },
  ]
}

const RECURRENCE_OPTIONS = Object.keys(EXPENSE_RECURRENCE_LABEL) as ExpenseRecurrence[]
const MONOTRIBUTO_OPTIONS: Monotributo[] = ['monotributo_1', 'monotributo_2', 'monotributo_3']

function toInput(expense: FixedExpense): ExpenseInput {
  const { id: _id, ...input } = expense
  return input
}

function emptyExpense(): ExpenseInput {
  return {
    concept: '',
    category: 'software',
    amount: 0,
    recurrence: 'monthly',
    responsible: '',
    monotributo: undefined,
    payStatus: 'pending',
    affectsProfitability: true,
    notes: '',
  }
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="type-caption fg-subtle">{label}</span>
      {children}
    </label>
  )
}

export function ExpenseForm({
  onClose,
  onSubmit,
  initial,
  title = 'Agregar gasto fijo',
  submitLabel = 'Agregar gasto',
}: {
  onClose: () => void
  onSubmit: (input: ExpenseInput) => Promise<boolean>
  initial?: ExpenseInput
  title?: string
  submitLabel?: string
}) {
  const [values, setValues] = useState<ExpenseInput>(initial ?? emptyExpense)
  const [submitting, setSubmitting] = useState(false)
  const { rules, isError: rulesFailed } = useMonthlyRules()
  const categoryOptions = rules.expenseCategories.includes(values.category)
    ? rules.expenseCategories
    : [values.category, ...rules.expenseCategories]
  function update<K extends keyof ExpenseInput>(key: K, value: ExpenseInput[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-xl">
        <form
          className="flex flex-col gap-6"
          onSubmit={async (event) => {
            event.preventDefault()
            if (submitting) return
            setSubmitting(true)
            const saved = await onSubmit({
              ...values,
              responsible: values.responsible || undefined,
              notes: values.notes || undefined,
            })
            if (!saved) setSubmitting(false)
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>Cargá un gasto del mes y su impacto en la rentabilidad.</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Gasto">
              <Input value={values.concept} onChange={(event) => update('concept', event.target.value)} required />
            </Field>
            <Field label="Categoría">
              <Select value={values.category} onValueChange={(value) => update('category', value)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map((option) => (
                    <SelectItem key={option} value={option}>
                      {EXPENSE_CATEGORY_LABEL[option as ExpenseCategory] ?? option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {rulesFailed ? (
                <span className="type-caption fg-subtle">
                  No pudimos cargar las categorías del estudio; estás viendo las de por defecto.
                </span>
              ) : null}
            </Field>
            <Field label="Monto (ARS)">
              <Input
                type="number"
                min={0}
                value={values.amount}
                onChange={(event) => update('amount', Number(event.target.value) || 0)}
              />
            </Field>
            <Field label="Recurrencia">
              <Select value={values.recurrence} onValueChange={(value) => update('recurrence', value as ExpenseRecurrence)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RECURRENCE_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {EXPENSE_RECURRENCE_LABEL[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Responsable/proveedor">
              <Input value={values.responsible} onChange={(event) => update('responsible', event.target.value)} />
            </Field>
            <Field label="Monotributo asociado">
              <Select
                value={values.monotributo ?? 'none'}
                onValueChange={(value) =>
                  update('monotributo', value === 'none' ? undefined : (value as Monotributo))
                }
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin asociar</SelectItem>
                  {MONOTRIBUTO_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {MONOTRIBUTO_FULL_LABEL[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Estado de pago">
              <Select value={values.payStatus} onValueChange={(value) => update('payStatus', value as ExpensePayStatus)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pendiente</SelectItem>
                  <SelectItem value="paid">Pagado</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          <label className="flex items-center gap-2 type-body-2 fg-default">
            <Checkbox
              checked={values.affectsProfitability}
              onCheckedChange={(checked) => update('affectsProfitability', !!checked)}
            />
            Impacta en la rentabilidad
          </label>

          <Field label="Notas">
            <Textarea value={values.notes} onChange={(event) => update('notes', event.target.value)} className="min-h-24" />
          </Field>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outlined" color="primary">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" variant="solid" color="primary" disabled={!values.concept.trim() || submitting}>
              {submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

const PAYMENT_RECIPIENT_LABEL: Record<MonthPaymentRecipient, string> = {
  collaborator: 'Colaboradora',
  employee: 'Empleada',
  provider: 'Proveedor',
  fixed_expense: 'Gasto fijo',
  monotributo: 'Monotributo',
  platform: 'Plataforma',
}

function paymentColumns(): ColumnDef<MonthPayment>[] {
  return [
    {
      accessorKey: 'concept',
      header: 'Concepto',
      cell: ({ row }) => <span className="fg-default">{row.original.concept}</span>,
    },
    {
      accessorKey: 'recipientName',
      header: 'Destinatario',
      cell: ({ row }) => <span className="fg-default">{row.original.recipientName}</span>,
    },
    {
      id: 'recipientType',
      header: 'Tipo',
      accessorFn: (p) => PAYMENT_RECIPIENT_LABEL[p.recipientType],
      meta: { mobile: 'badge' },
      cell: ({ row }) => <Badge variant="neutral">{PAYMENT_RECIPIENT_LABEL[row.original.recipientType]}</Badge>,
    },
    {
      id: 'total',
      header: 'Monto',
      accessorFn: (p) => p.total,
      cell: ({ row }) => <span className="fg-default tabular-nums">{formatCurrency(row.original.total)}</span>,
    },
    {
      id: 'paid',
      header: 'Pagado',
      accessorFn: (p) => p.paid,
      cell: ({ row }) => (
        <span className={cn('tabular-nums', row.original.paid > 0 ? 'fg-default' : 'fg-subtle')}>
          {row.original.paid > 0 ? formatCurrency(row.original.paid) : NO_REGISTRO}
        </span>
      ),
    },
    {
      id: 'paymentDate',
      header: 'Fecha de pago',
      accessorFn: (p) => p.paymentDate ?? '',
      cell: ({ row }) => (
        <span className={row.original.paymentDate ? 'fg-default' : 'fg-subtle'}>
          {row.original.paymentDate ? formatDate(row.original.paymentDate) : NO_REGISTRO}
        </span>
      ),
    },
  ]
}

function MonthPaymentsTable() {
  const op = useMonthlyOperation()
  const columns = useMemo(() => paymentColumns(), [])
  const shown = op.data.payments.length
  const recorded = op.data.paymentTotals.reduce((sum, t) => sum + t.count, 0)
  const otherLane = op.data.otherLanePaymentCount
  const ownExpenses = op.data.expenses.length

  return (
    <div className="flex flex-col gap-2">
      <DataTable
        columns={columns}
        data={op.data.payments}
        pageSize={25}
        getRowId={(payment) => payment.id}
        emptyState={() => <span>No hay pagos cargados este mes</span>}
      />
      {ownExpenses > 0 && recorded > 0 ? (
        <span className="type-caption fg-warning">
          Este mes tiene gastos cargados en los dos lados. Si alguno está en Pagos y también en
          la lista de abajo, se está contando dos veces.
        </span>
      ) : null}
      {recorded > shown ? (
        <span className="type-caption fg-subtle">
          {`Se muestran ${shown} de ${recorded} pagos del mes. Los totales de arriba incluyen todos.`}
        </span>
      ) : null}
      {otherLane > 0 ? (
        <span className="type-caption fg-subtle">
          {otherLane === 1
            ? 'Hay 1 pago del mes en otra moneda, que no entra en esta lista ni en los totales. Se ve en Pagos.'
            : `Hay ${otherLane} pagos del mes en otra moneda, que no entran en esta lista ni en los totales. Se ven en Pagos.`}
        </span>
      ) : null}
    </div>
  )
}

export function ExpensesTab() {
  const op = useMonthlyOperation()
  const [open, setOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<FixedExpense | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<FixedExpense | null>(null)
  const [deleting, setDeleting] = useState(false)
  const columns = expenseColumns({ onEdit: setEditTarget, onDelete: setDeleteTarget }, op.locked)

  async function confirmDelete() {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    const removed = await op.deleteExpense(deleteTarget.id)
    setDeleting(false)
    if (!removed) return
    toast.success('Gasto eliminado')
    setDeleteTarget(null)
  }

  return (
    <>
      <MonthPaymentsTable />
      <DataTable
        columns={columns}
        data={op.data.expenses}
        pageSize={25}
        getRowId={(expense) => expense.id}
        toolbar={() => (
          <Toolbar
            trailing={
              <span className="type-caption fg-subtle">Los gastos nuevos se cargan en Pagos</span>
            }
          />
        )}
        emptyState={() => <span>No hay gastos cargados este mes</span>}
      />
      {open ? (
        <ExpenseForm
          onClose={() => setOpen(false)}
          onSubmit={async (input) => {
            if (!(await op.addExpense(input))) return false
            setOpen(false)
            toast.success('Gasto agregado')
            return true
          }}
        />
      ) : null}

      {editTarget ? (
        <ExpenseForm
          key={editTarget.id}
          initial={toInput(editTarget)}
          title="Editar gasto"
          submitLabel="Guardar cambios"
          onClose={() => setEditTarget(null)}
          onSubmit={async (input) => {
            if (!(await op.updateExpense(editTarget.id, input))) return false
            setEditTarget(null)
            toast.success('Gasto actualizado')
            return true
          }}
        />
      ) : null}

      {deleteTarget ? (
        <AlertDialog open onOpenChange={(next) => (next ? undefined : setDeleteTarget(null))}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminar el gasto</AlertDialogTitle>
              <AlertDialogDescription>
                Se elimina “{deleteTarget.concept}” del mes
                {deleteTarget.affectsProfitability ? ', y deja de restar en la rentabilidad' : ''}. No
                se puede deshacer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                color="danger"
                disabled={deleting}
                onClick={(event) => {
                  event.preventDefault()
                  void confirmDelete()
                }}
              >
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </>
  )
}

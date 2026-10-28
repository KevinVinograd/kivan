import { useState } from 'react'
import type { ColumnDef, FilterFn, RowSelectionState } from '@tanstack/react-table'

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
  toast,
} from '@/app/components/components'
import { DataTable, Toolbar } from '@/app/components/patterns'
import { AFFORDANCE, ICON } from '@/app/lib/icon-registry'
import { useRole } from '@/app/lib/use-role'
import { ProductionForm, toInput } from './monthly-production-form'
import type { ProductionRecord } from './monthly-operation-mock-data'
import {
  NO_VALUE,
  formatCurrency,
  formatDate,
  productionBillableLabel,
  productionSearchText,
  productionStatusBadge,
} from './monthly-operation-format'
import { useMonthlyOperation } from './monthly-operation-data'
import { ProductionsBulkBar } from './monthly-production-bulk-bar'
import {
  ReceiptCell,
  ViaticsCell,
  formatDuration,
  owedViatics,
  packCaption,
} from './monthly-production-viatics'
import { todayIso } from '@/app/lib/iso-date'

function productionRowAlert(p: ProductionRecord): { label: string; tone: 'danger' | 'warning' } | null {
  if (!p.clientId) return { label: 'Sin cliente', tone: 'danger' }
  if (p.status === 'approved' && p.billable == null) return { label: 'Falta definir', tone: 'warning' }
  return null
}

const globalFilterFn: FilterFn<ProductionRecord> = (row, _columnId, value) =>
  productionSearchText(row.original).includes(String(value).toLowerCase())

export type ProductionRowActions = {
  onEdit: (production: ProductionRecord) => void
  onDelete: (production: ProductionRecord) => void
  /** Viático paid back today, or owed again (null). Allowed on a closed month. */
  onMarkViatic: (production: ProductionRecord, paidAt: string | null) => void
  /** Approve (true) or send back to pending (false). */
  onApprove: (production: ProductionRecord, approved: boolean) => void
}

function productionColumns(actions: ProductionRowActions, locked: boolean): ColumnDef<ProductionRecord>[] {
  return [
    {
      // Any row can be picked: the batch approves productions and settles viáticos, and
      // each action then applies only to the rows it fits (ProductionsBulkBar).
      id: 'select',
      enableSorting: false,
      enableHiding: false,
      header: ({ table }) => (
        <div className="flex size-6 items-center justify-center">
          <Checkbox
            checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Seleccionar todas las producciones"
          />
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex size-6 items-center justify-center" onClick={(event) => event.stopPropagation()}>
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label={`Seleccionar ${row.original.title}`}
          />
        </div>
      ),
    },
    {
      accessorKey: 'date',
      id: 'date',
      header: 'Fecha',
      meta: { mobile: 'secondary' },
      cell: ({ row }) => <span className="fg-default">{formatDate(row.original.date)}</span>,
    },
    {
      id: 'client',
      header: 'Cliente',
      accessorFn: (p) => p.clientName,
      cell: ({ row }) =>
        row.original.clientName ? (
          <span className="fg-default">{row.original.clientName}</span>
        ) : (
          <span className="fg-danger">Sin cliente</span>
        ),
    },
    {
      id: 'production',
      header: 'Producción',
      meta: { mobile: 'title' },
      accessorFn: (p) => p.title,
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="type-button fg-default">{row.original.title}</span>
          <span className="type-caption fg-subtle">{row.original.type}</span>
        </div>
      ),
    },
    {
      id: 'accountManager',
      header: 'Account manager',
      accessorFn: (p) => p.accountManagerName ?? '',
      cell: ({ row }) =>
        row.original.accountManagerName ? (
          <span className="fg-default">{row.original.accountManagerName}</span>
        ) : (
          <span className="fg-subtle">{NO_VALUE}</span>
        ),
    },
    {
      accessorKey: 'responsible',
      id: 'responsible',
      header: 'Content creator',
      cell: ({ row }) =>
        row.original.responsible ? (
          <span className="fg-default">{row.original.responsible}</span>
        ) : (
          <span className="fg-subtle">{NO_VALUE}</span>
        ),
    },
    {
      accessorKey: 'hours',
      id: 'hours',
      header: 'Horas',
      cell: ({ row }) => <span className="tabular-nums fg-default">{formatDuration(row.original.hours)}</span>,
    },
    {
      accessorKey: 'viatics',
      id: 'viatics',
      header: 'Viáticos',
      cell: ({ row }) => <ViaticsCell production={row.original} />,
    },
    {
      id: 'receipt',
      header: 'Comprobante',
      enableSorting: false,
      cell: ({ row }) => <ReceiptCell receipt={row.original.receipt} />,
    },
    {
      accessorKey: 'totalCost',
      id: 'totalCost',
      header: 'Costo',
      meta: { mobile: 'secondary' },
      cell: ({ row }) => <span className="tabular-nums fg-default">{formatCurrency(row.original.totalCost)}</span>,
    },
    {
      id: 'billable',
      header: 'Facturable',
      accessorFn: (p) => p.billable ?? 'z',
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className={cn('type-body-2', row.original.billable ? 'fg-default' : 'fg-warning')}>
            {productionBillableLabel(row.original)}
          </span>
          {/* Hours the client's per-hour service already includes this month bill nothing:
              without this the row reads as a production nobody is charging for. */}
          {row.original.packHours ? (
            <span className="type-caption fg-subtle">{packCaption(row.original)}</span>
          ) : null}
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Estado',
      meta: { mobile: 'badge' },
      accessorFn: (p) => p.status,
      cell: ({ row }) => {
        // Billed on a cobro: said in the product's words ("Facturada" would claim an
        // ARCA factura that may not exist yet).
        if (row.original.receivableId) return <Badge variant="success">En cobro</Badge>
        const badge = productionStatusBadge(row.original.status)
        return <Badge variant={badge.variant}>{badge.label}</Badge>
      },
    },
    {
      id: 'alerts',
      header: 'Alertas',
      enableSorting: false,
      cell: ({ row }) => {
        const alert = productionRowAlert(row.original)
        if (!alert) return <span className="fg-subtle">{NO_VALUE}</span>
        return <Badge variant={alert.tone === 'danger' ? 'danger' : 'warning'}>{alert.label}</Badge>
      },
    },
    {
      id: 'actions',
      enableSorting: false,
      enableHiding: false,
      cell: ({ row }) => {
        const production = row.original
        // A production on a cobro is part of that cobro's amount: the API refuses to edit
        // or delete it until the cobro is cancelled, so the menu does not offer it.
        const frozen = locked || Boolean(production.receivableId)
        return (
          <div className="flex justify-end" onClick={(event) => event.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Acciones de la producción"
                className={cn(buttonVariants({ variant: 'transparent', color: 'primary' }), 'size-8 shrink-0')}
              >
                <AFFORDANCE.overflow className="size-4" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {/* Disabled on a CLOSED month, the same lock every other mutation here respects:
                    a closed month is the record of what happened, not a draft to keep editing. */}
                <DropdownMenuItem disabled={frozen} onSelect={() => actions.onEdit(production)}>
                  <ICON.edit aria-hidden />
                  Editar
                </DropdownMenuItem>
                {/* Only approved productions are billed and paid; the lead's "se hizo". */}
                {production.status !== 'invoiced' ? (
                  <DropdownMenuItem
                    disabled={frozen}
                    onSelect={() => actions.onApprove(production, production.status !== 'approved')}
                  >
                    <ICON.statusSuccess aria-hidden />
                    {production.status === 'approved' ? 'Quitar aprobación' : 'Aprobar'}
                  </DropdownMenuItem>
                ) : null}
                {/* Not frozen by a closed month or a cobro: the viático is paid back
                    whenever the week's payments go out. */}
                {production.viatics > 0 ? (
                  <DropdownMenuItem
                    onSelect={() =>
                      actions.onMarkViatic(production, production.viaticsPaidAt ? null : todayIso())
                    }
                  >
                    <ICON.statusSuccess aria-hidden />
                    {production.viaticsPaidAt ? 'Marcar viático sin pagar' : 'Marcar viático pagado hoy'}
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={frozen}
                  variant="destructive"
                  onSelect={() => actions.onDelete(production)}
                >
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


/** Producciones tab — productions table + the add / edit / delete flows. */
export function ProductionsTab() {
  const op = useMonthlyOperation()
  const { canDo } = useRole()
  const [open, setOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ProductionRecord | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<ProductionRecord | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [marking, setMarking] = useState(false)
  const columns = productionColumns(
    {
      onEdit: setEditTarget,
      onDelete: setDeleteTarget,
      onMarkViatic: (p, paidAt) => void markViatics([p], paidAt),
      onApprove: (p, approved) => void approve([p], approved),
    },
    op.locked,
  )
  const selected = op.data.productions.filter((p) => rowSelection[p.id])
  const owed = owedViatics(op.data.productions)
  const awaiting = op.data.productions.filter((p) => p.status === 'pending' && !p.receivableId).length

  async function approve(productions: ProductionRecord[], approved: boolean) {
    if (marking || productions.length === 0) return
    setMarking(true)
    const ok = await op.approveProductions(
      productions.map((p) => p.id),
      approved,
    )
    setMarking(false)
    if (!ok) return
    setRowSelection({})
    const n = productions.length
    toast.success(
      approved
        ? n === 1 ? 'Producción aprobada' : `${n} producciones aprobadas`
        : n === 1 ? 'Aprobación quitada' : `Aprobación quitada a ${n} producciones`,
    )
  }

  async function markViatics(productions: ProductionRecord[], paidAt: string | null) {
    if (marking || productions.length === 0) return
    setMarking(true)
    const ok = await op.markViaticsPaid(
      productions.map((p) => p.id),
      paidAt,
    )
    setMarking(false)
    if (!ok) return
    setRowSelection({})
    const n = productions.length
    toast.success(
      paidAt
        ? n === 1 ? 'Viático marcado como pagado' : `${n} viáticos marcados como pagados`
        : n === 1 ? 'Viático marcado sin pagar' : `${n} viáticos marcados sin pagar`,
    )
  }

  async function confirmDelete() {
    if (!deleteTarget || deleting) return
    setDeleting(true)
    const removed = await op.deleteProduction(deleteTarget.id)
    setDeleting(false)
    // The dialog stays open when the write fails: closing it would report a deletion that did
    // not happen, and the row would still be sitting there behind it.
    if (!removed) return
    toast.success('Producción eliminada')
    setDeleteTarget(null)
  }

  return (
    <>
      {awaiting > 0 ? (
        <p className="type-body-2 fg-subtle">
          {`${awaiting === 1 ? '1 producción sin aprobar' : `${awaiting} producciones sin aprobar`}: no se cobran ni se pagan hasta aprobarlas.`}
        </p>
      ) : null}
      {owed.count > 0 ? (
        <p className="type-body-2 fg-subtle">
          {`Viáticos sin pagar: ${formatCurrency(owed.amount)} en ${owed.count} ${
            owed.count === 1 ? 'producción' : 'producciones'
          }`}
        </p>
      ) : null}
      <DataTable
        columns={columns}
        data={op.data.productions}
        pageSize={25}
        globalFilterFn={globalFilterFn}
        getRowId={(production) => production.id}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        toolbar={(table) => (
          <Toolbar
            bulk={
              <ProductionsBulkBar
                selected={selected}
                locked={op.locked}
                busy={marking}
                onApprove={(rows, approved) => void approve(rows, approved)}
                onMarkViatics={(rows, paidAt) => void markViatics(rows, paidAt)}
                onClear={() => setRowSelection({})}
              />
            }
            search={{
              value: (table.getState().globalFilter as string) ?? '',
              onChange: (value) => table.setGlobalFilter(value),
              placeholder: 'Buscar producción',
              label: 'Buscar producciones',
            }}
            trailing={
              canDo('production.create') ? (
                <Button
                  variant="solid"
                  color="primary"
                  disabled={op.locked}
                  onClick={() => setOpen(true)}
                >
                  Cargar producción
                </Button>
              ) : undefined
            }
          />
        )}
        emptyState={() => <span>No hay producciones cargadas este mes</span>}
      />
      {open ? (
        <ProductionForm
          onClose={() => setOpen(false)}
          onSubmit={async (input) => {
            if (!(await op.addProduction(input))) return false
            setOpen(false)
            toast.success('Producción cargada')
            return true
          }}
        />
      ) : null}

      {/* Keyed on the row id so switching rows remounts the form with the new prefill — a
          `useState` initial value is read once, so a shared instance would keep showing the
          first row you opened. */}
      {editTarget ? (
        <ProductionForm
          key={editTarget.id}
          initial={toInput(editTarget)}
          title="Editar producción"
          submitLabel="Guardar cambios"
          onClose={() => setEditTarget(null)}
          onSubmit={async (input) => {
            if (!(await op.updateProduction(editTarget.id, input))) return false
            setEditTarget(null)
            toast.success('Producción actualizada')
            return true
          }}
        />
      ) : null}

      {deleteTarget ? (
        <AlertDialog open onOpenChange={(next) => (next ? undefined : setDeleteTarget(null))}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminar la producción</AlertDialogTitle>
              <AlertDialogDescription>
                Se elimina “{deleteTarget.title}” del mes. Sus horas y su costo dejan de contar en
                la rentabilidad. No se puede deshacer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                color="danger"
                disabled={deleting}
                onClick={(event) => {
                  // Radix closes the dialog on click by default. Hold it open: the write can
                  // fail, and a dialog that has already dismissed cannot report that.
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

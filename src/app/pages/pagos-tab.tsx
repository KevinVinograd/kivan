import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { FilterFn, Table } from '@tanstack/react-table'

import { cn } from '@/app/lib/utils'
import { AFFORDANCE } from '@/app/lib/icon-registry'
import { useIsBelowDesktop, useIsMobile } from '@/app/lib/use-is-mobile'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconButton,
  buttonVariants,
  toast,
} from '@/app/components/components'
import { DataTable, KpiSummaryCard, Toolbar } from '@/app/components/patterns'
import { MasterDetailLayout, SectionHeader } from '@/app/components/templates'
import { CobranzaEmptyFiltered, PagosEmpty } from './cobranza-states'
import { CobranzaDetailEmpty } from './cobranza-detail-ui'
import { FiltersPopover } from './cobranza-filters'
import { pagosColumns, type PagosRowActions } from './pagos-columns'
import {
  PAGOS_FILTER_FIELDS,
  PAGOS_HERO_IDS,
  pagosKpis,
  paymentSearchText,
} from './pagos-format'
import { PagosList } from './pagos-list'
import { PagosDetail } from './pagos-detail'
import { PagosRegistrarPagoDialog } from './pagos-registrar-pago-dialog'
import { PagosEditPagoDialog } from './pagos-edit-pago-dialog'
import { PagosCreatePagoDialog } from './pagos-create-pago-dialog'
import { type Payment } from './pagos-mock-data'
import { usePayments } from './payments-data'
import { formatMoney } from './cobranza-format'

const globalFilterFn: FilterFn<Payment> = (row, _columnId, value) =>
  paymentSearchText(row.original).includes(String(value).toLowerCase())

function PagosColumnsMenu({ table }: { table: Table<Payment> }) {
  const isBelowDesktop = useIsBelowDesktop()
  const columns = table.getAllColumns().filter((column) => column.getCanHide())
  return (
    <DropdownMenu>
      {isBelowDesktop ? (
        <DropdownMenuTrigger asChild>
          <IconButton
            variant="outlined"
            color="primary"
            aria-label="Ver columnas"
            title="Ver columnas"
          >
            <AFFORDANCE.columns className="size-5" aria-hidden />
          </IconButton>
        </DropdownMenuTrigger>
      ) : (
        <DropdownMenuTrigger
          className={cn(buttonVariants({ variant: 'outlined', color: 'primary' }), 'h-10 gap-2 px-3')}
        >
          <AFFORDANCE.columns className="size-4" aria-hidden />
          Ver columnas
        </DropdownMenuTrigger>
      )}
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Columnas</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {columns.map((column) => (
          <DropdownMenuCheckboxItem
            key={column.id}
            checked={column.getIsVisible()}
            onCheckedChange={(value) => column.toggleVisibility(!!value)}
            onSelect={(event) => event.preventDefault()}
          >
            {typeof column.columnDef.header === 'string' ? column.columnDef.header : column.id}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function PagosToolbar({ table }: { table: Table<Payment> }) {
  const globalFilter = (table.getState().globalFilter as string | undefined) ?? ''
  return (
    <Toolbar
      search={{
        value: globalFilter,
        onChange: (value) => table.setGlobalFilter(value),
        placeholder: 'Buscar pagos',
        label: 'Buscar pagos',
      }}
      filters={<FiltersPopover table={table} fields={PAGOS_FILTER_FIELDS} />}
      trailing={<PagosColumnsMenu table={table} />}
    />
  )
}

type PagosTabProps = {
  selectedPeriod: string
  selectedId: string | null
  onSelect: (id: string) => void
  onClose: () => void
  inDetail: boolean
  breadcrumb?: ReactNode
  periodControl?: ReactNode
  createOpen?: boolean
  onCloseCreate?: () => void
  onModeChange?: (mode: 'table' | 'split') => void
  dissolved?: boolean
}

export function PagosTab({
  selectedPeriod,
  selectedId,
  onSelect,
  onClose,
  inDetail,
  breadcrumb,
  periodControl,
  createOpen,
  onCloseCreate,
  onModeChange,
  dissolved = false,
}: PagosTabProps) {
  const { payments: data, createPayment, registerPayment, updatePayment, approvePayment, cancelPayment } =
    usePayments()
  const isMobile = useIsMobile()
  const belowDesktop = useIsBelowDesktop()
  const [confirm, setConfirm] = useState<{ payment: Payment; action: 'approve' | 'cancel' } | null>(
    null,
  )
  const [payTarget, setPayTarget] = useState<Payment | null>(null)
  const [editTarget, setEditTarget] = useState<Payment | null>(null)

  useEffect(() => {
    if (selectedId == null) return
    const current = data.find((payment) => payment.id === selectedId)
    if (!current) return
    const next = data.find(
      (payment) =>
        payment.period === selectedPeriod && payment.recipientName === current.recipientName,
    )
    if (next && next.id !== selectedId) onSelect(next.id)
  }, [selectedPeriod, selectedId, data, onSelect])

  async function confirmPaymentAction() {
    if (!confirm) return
    const { payment, action } = confirm
    setConfirm(null)
    try {
      if (action === 'approve') await approvePayment(payment.id)
      else await cancelPayment(payment.id)
      toast.success(action === 'approve' ? 'Pago aprobado' : 'Pago cancelado')
    } catch {
      toast.error(action === 'approve' ? 'No se pudo aprobar el pago' : 'No se pudo cancelar el pago')
    }
  }

  const rowActions = useMemo<PagosRowActions>(
    () => ({
      onView: (payment) => onSelect(payment.id),
      onApprove: (payment) => setConfirm({ payment, action: 'approve' }),
      onMarkPaid: (payment) => setPayTarget(payment),
      onEdit: (payment) => setEditTarget(payment),
      onCancel: (payment) => setConfirm({ payment, action: 'cancel' }),
    }),
    [onSelect],
  )

  const columns = useMemo(() => pagosColumns(rowActions), [rowActions])
  const periodData = useMemo(
    () => data.filter((payment) => payment.period === selectedPeriod),
    [data, selectedPeriod],
  )
  const kpis = useMemo(() => pagosKpis(periodData), [periodData])

  const isTablet = belowDesktop && !isMobile
  const initialColumnVisibility = {
    lastActivity: false,
    paymentDate: false,
    currency: false,
    ...(isTablet
      ? {
          recipientType: false,
          period: false,
          concept: false,
          expectedDate: false,
          method: false,
          accountAlias: false,
        }
      : {}),
  }

  const selected = periodData.find((payment) => payment.id === selectedId) ?? null
  const layoutSelectedId = inDetail ? (selected ? selectedId : '__pagos-empty__') : null

  const header = <SectionHeader title="Pagos" breadcrumb={breadcrumb} actions={periodControl} />

  const tableInner =
    periodData.length === 0 ? (
      <PagosEmpty />
    ) : (
      <div className="flex flex-col gap-4 md:gap-6">
        <div className="flex flex-col gap-4 px-4 md:px-6 lg:px-8 desktop:px-10">
          <KpiSummaryCard
            figures={kpis}
            heroId={PAGOS_HERO_IDS}
            collapsible
            storageKey="pagos"
            footer={
              <span className="type-caption fg-subtle">
                Cada moneda es un total aparte: no se suman.
              </span>
            }
          />
        </div>
        <div className="px-4 md:px-6 lg:px-8 desktop:px-10">
          <DataTable
            columns={columns}
            data={periodData}
            pageSize={20}
            pinActionsColumn
            initialColumnVisibility={initialColumnVisibility}
            globalFilterFn={globalFilterFn}
            getRowId={(payment) => payment.id}
            onRowClick={(payment) => onSelect(payment.id)}
            toolbar={(table) => <PagosToolbar table={table} />}
            emptyState={(table) => (
              <CobranzaEmptyFiltered
                onClearFilters={() => {
                  table.resetColumnFilters()
                  table.setGlobalFilter('')
                }}
              />
            )}
          />
        </div>
      </div>
    )

  return (
    <>
      <MasterDetailLayout
        selectedId={layoutSelectedId}
        detailType="medium"
        onModeChange={onModeChange}
        onCloseDetail={onClose}
        detailTitle="Detalle del pago"
        table={
          <div className={cn('flex flex-col', dissolved && 'pt-[var(--md-table-offset)]')}>
            {tableInner}
          </div>
        }
        list={
          <>
            {inDetail && !belowDesktop ? header : null}
            <PagosList payments={periodData} selectedId={selectedId} onSelect={onSelect} />
          </>
        }
        detail={
          selected ? (
            <PagosDetail
              payment={selected}
              onClose={onClose}
              onApprove={(payment) => setConfirm({ payment, action: 'approve' })}
              onMarkPaid={(payment) => setPayTarget(payment)}
              periodControl={belowDesktop ? periodControl : undefined}
            />
          ) : (
            <CobranzaDetailEmpty label="Seleccioná un pago para ver el detalle" onClose={onClose} />
          )
        }
      />

      {confirm ? (
        <AlertDialog open onOpenChange={(open) => (open ? undefined : setConfirm(null))}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {confirm.action === 'approve' ? 'Aprobar pago' : 'Cancelar pago'}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {confirm.action === 'approve'
                  ? `El pago a ${confirm.payment.recipientName} por ${formatMoney(confirm.payment.totalAmount, confirm.payment.currency)} quedará aprobado.`
                  : `El pago a ${confirm.payment.recipientName} por ${formatMoney(confirm.payment.totalAmount, confirm.payment.currency)} quedará cancelado. Esta acción no se puede deshacer.`}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setConfirm(null)}>Volver</AlertDialogCancel>
              <AlertDialogAction
                color={confirm.action === 'approve' ? 'primary' : 'danger'}
                onClick={confirmPaymentAction}
              >
                {confirm.action === 'approve' ? 'Aprobar pago' : 'Cancelar pago'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
      {payTarget ? (
        <PagosRegistrarPagoDialog
          payment={payTarget}
          onRegister={async (amount, paymentDate, treasuryAccountId, method) => {
            await registerPayment(payTarget.id, amount, paymentDate, treasuryAccountId, method)
          }}
          onClose={() => setPayTarget(null)}
        />
      ) : null}
      {editTarget ? (
        <PagosEditPagoDialog
          payment={editTarget}
          onSave={async (input) => {
            await updatePayment(editTarget.id, input)
          }}
          onClose={() => setEditTarget(null)}
        />
      ) : null}
      {createOpen ? (
        <PagosCreatePagoDialog
          period={selectedPeriod}
          onCreate={async (input) => {
            await createPayment(input)
          }}
          onClose={() => onCloseCreate?.()}
        />
      ) : null}
    </>
  )
}

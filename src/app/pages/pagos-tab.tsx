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

// Column-visibility menu, mirroring the Clients/Team toolbars (`clients-toolbar.tsx`).
// Repeated locally per the design-system 1:1 no-shared-composition policy.
function PagosColumnsMenu({ table }: { table: Table<Payment> }) {
  // Below desktop (≤1023px: tablet + phone) the toolbar collapses to icon-only
  // controls; from `lg` up the labelled "Ver columnas" button returns.
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
  /** Optional breadcrumb shown in the navigator header (e.g. a deep link from Reportes). */
  breadcrumb?: ReactNode
  /** Compact period picker for the navigator header (shown while a record is open). */
  periodControl?: ReactNode
  /** Page-owned "Nuevo pago" trigger: the header button opens the create dialog. */
  createOpen?: boolean
  onCloseCreate?: () => void
  /**
   * Effective master-detail mode, reported straight up from MasterDetailLayout. The
   * PageHeader lives in the SHELL (cobranza-page), not here, so the shell owns the
   * `mode` state and this tab only forwards the layout's report. It trails the panel
   * exit, so the shell can fade its header back in in lockstep with the collapsing
   * split instead of mid-exit.
   */
  onModeChange?: (mode: 'table' | 'split') => void
  /**
   * Whether the shell's PageHeader is dissolved (desktop split open). Fed DOWN from
   * the shell because the table slot lives here: while dissolved the shell's content
   * layer covers the faded header, so the table has to be pushed back down by the
   * header height to stay anchored. Do not derive it locally — the shell is the one
   * that knows, and a second source of truth would drift.
   */
  dissolved?: boolean
}

/**
 * Pagos table — the §11 master table on the Pagos page (`/pagos`) master-detail
 * surface, scoped to the selected period (§6). Selection is controlled by the page;
 * the §12 detail opens beside the compact navigator. Row/detail mutations (approve,
 * register, edit, cancel) and the page-driven create dialog are wired; the cuenta
 * corriente surfaces land later.
 */
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
  // Create, register, approve, edit and cancel persist through the API; the
  // Operación mensual allocation still uses the optimistic-local applyPayment.
  const { payments: data, createPayment, registerPayment, updatePayment, approvePayment, cancelPayment } =
    usePayments()
  const isMobile = useIsMobile()
  // Below desktop the detail is a covering bottom Sheet, so the list navigator header
  // must not appear behind it (the reflow pushes the visible strip around the sheet).
  const belowDesktop = useIsBelowDesktop()
  const [confirm, setConfirm] = useState<{ payment: Payment; action: 'approve' | 'cancel' } | null>(
    null,
  )
  const [payTarget, setPayTarget] = useState<Payment | null>(null)
  const [editTarget, setEditTarget] = useState<Payment | null>(null)

  // On period change, re-resolve the selection to the same recipient in the new
  // period (the payment id differs per period) so switching period from the detail
  // keeps the master-detail split open. No match → the stale id stays selected and
  // the layout shows the empty detail rather than dropping to the table. Idempotent.
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

  // Approve (materially-changing) and cancel (destructive) both confirm first
  // (feedback §7), then persist via the API and confirm with a success toast.
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

  // Column-priority seed. F3 (desktop): the trailing low-value "Última actividad"
  // and "Fecha de pago" columns clip at rest and read as broken data, so hide both
  // at every viewport (re-addable via "Ver columnas"); the boundary then lands on a
  // genuinely low-value column while Monto/Estado stay fully visible. F1 (tablet
  // only): the 11-column grid overflows the narrowed content column, pushing the
  // amount off the right edge — so at tablet keep just Destinatario, Monto and Estado
  // plus the pinned actions so the amount (the finding's core casualty) reads fully.
  // The tablet reductions are gated `isTablet` (not below-desktop) so the phone
  // card-list, which reads visible cells, keeps its fields untouched.
  const isTablet = belowDesktop && !isMobile
  const initialColumnVisibility = {
    lastActivity: false,
    paymentDate: false,
    // The lane is already on every `Monto` cell; this column exists so the Moneda filter
    // has a column id to target.
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

  // Navigator header (`list`), shown only while a record is open (`inDetail`).
  // In table mode the page's PageHeader carries the title; on mobile the list is
  // the full-width base under that PageHeader — so this is gated on `inDetail` to
  // avoid duplicating the title.
  const header = <SectionHeader title="Pagos" breadcrumb={breadcrumb} actions={periodControl} />

  const tableInner =
    periodData.length === 0 ? (
      <PagosEmpty />
    ) : (
      <div className="flex flex-col gap-4 md:gap-6">
        {/* §6 master-view focal → Total a pagar (the period's total outgoing). */}
        <div className="flex flex-col gap-4 px-4 md:px-6 lg:px-8 desktop:px-10">
          {/* ONE card, TWO co-equal heroes. The lanes used to live in a second card at
              `type-section` (20px) with `heroId={null}`, so the viewport held a single
              hero; the convention permits two when both are genuinely
              Primary in § 6 — "two protagonists the view exists to compare side by
              side" — which is what a period's peso total and dollar total are. Both are
              Primary on this page.

              The footer stays, and matters MORE here than it did under the old layout:
              two equal figures side by side are easier to read as addable than a total
              with a smaller aside beneath it. There is no combined total in this product
              and none is offered. */}
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
        // `--md-table-offset` is published on the SHELL's region node (cobranza-page,
        // via useHeaderOffset) and consumed here. That works because custom properties
        // inherit down the DOM and the region is an ancestor of this slot — but nothing
        // in the type system links the two, so keep the names in step. The offset rides
        // this slot wrapper, not the inner DataTable gutter: the KPI card above the
        // table has to shift down with it as one block. Horizontal gutters stay with
        // the children (copying them here would double-inset the whole master view).
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
              // Hand the period control to the detail wherever the detail is a COVERING
              // Sheet — which MasterDetailLayout decides on `isBelowDesktop`, not
              // `isMobile`. Gating this on `isMobile` left the 768-1023 band with no
              // reachable period picker at all: the PageHeader's Select stays mounted but
              // sits under the Sheet's modal scrim, so the user had to close the record,
              // change period, and re-open it. On desktop the split leaves the header
              // reachable, so the detail must NOT duplicate the control.
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

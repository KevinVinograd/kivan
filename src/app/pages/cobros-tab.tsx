import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { FilterFn, Table } from '@tanstack/react-table'

import { cn } from '@/app/lib/utils'
import { AFFORDANCE } from '@/app/lib/icon-registry'
import { useIsBelowDesktop } from '@/app/lib/use-is-mobile'
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
import { CobranzaEmptyFiltered, CobrosEmpty } from './cobranza-states'
import { CobranzaDetailEmpty } from './cobranza-detail-ui'
import { FiltersPopover } from './cobranza-filters'
import { cobrosColumns, type CobrosRowActions } from './cobros-columns'
import {
  COBROS_FILTER_FIELDS,
  COBROS_HERO_IDS,
  cobrosKpis,
  receivableSearchText,
} from './cobros-format'
import { CobrosList } from './cobros-list'
import { CobrosDetail } from './cobros-detail'
import { CobrosGenerarFacturaDialog } from './cobros-generar-factura-dialog'
import { CobrosGenerarMesDialog } from './cobros-generar-mes-dialog'
import { CobrosAsociarFacturaDialog } from './cobros-asociar-factura-dialog'
import { CobrosEnviarFacturaDialog } from './cobros-enviar-factura-dialog'
import { CobrosRegistrarCobroDialog } from './cobros-registrar-cobro-dialog'
import { CobrosEditCobroDialog } from './cobros-edit-cobro-dialog'
import { CobrosEditFiscalDataDialog } from './cobros-edit-fiscal-dialog'
import { CobrosCreateCobroDialog } from './cobros-create-cobro-dialog'
import { type CobrosInvoiceDialog } from './cobros-invoice'
import { formatMoney } from './cobranza-format'
import { useReceivables } from './receivables-data'
import type { Receivable } from './cobros-mock-data'

const globalFilterFn: FilterFn<Receivable> = (row, _columnId, value) =>
  receivableSearchText(row.original).includes(String(value).toLowerCase())

// Column-visibility menu, mirroring the Clients/Team toolbars (`clients-toolbar.tsx`).
// Repeated locally per the design-system 1:1 no-shared-composition policy.
function CobrosColumnsMenu({ table }: { table: Table<Receivable> }) {
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

function CobrosToolbar({ table }: { table: Table<Receivable> }) {
  const globalFilter = (table.getState().globalFilter as string | undefined) ?? ''
  return (
    <Toolbar
      search={{
        value: globalFilter,
        onChange: (value) => table.setGlobalFilter(value),
        placeholder: 'Buscar cobros',
        label: 'Buscar cobros',
      }}
      filters={<FiltersPopover table={table} fields={COBROS_FILTER_FIELDS} />}
      trailing={<CobrosColumnsMenu table={table} />}
    />
  )
}

type CobrosTabProps = {
  selectedPeriod: string
  selectedId: string | null
  onSelect: (id: string) => void
  onClose: () => void
  inDetail: boolean
  /** Optional breadcrumb shown in the navigator header (e.g. a deep link from Reportes). */
  breadcrumb?: ReactNode
  /** Compact period picker for the navigator header (shown while a record is open). */
  periodControl?: ReactNode
  /** Page-owned "Nuevo cobro" trigger: the header button opens the create dialog. */
  createOpen?: boolean
  onCloseCreate?: () => void
  /** Page-owned "Generar cobros del mes" trigger (the month's retainers, in one action). */
  generateOpen?: boolean
  onCloseGenerate?: () => void
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
 * Cobros table — the §8 master table on the Cobros page (`/cobros`) master-detail
 * surface, scoped to the selected period (§6) with the §9 facturación subflow wired
 * in. Selection is controlled by the page; the tab owns the full (mutable) demo
 * dataset and the facturación dialogs. Collection, edit and cancel run through their
 * dialogs (registrar cobro / editar / cancelar). No backend, no fake delays.
 */
export function CobrosTab({
  selectedPeriod,
  selectedId,
  onSelect,
  onClose,
  inDetail,
  breadcrumb,
  periodControl,
  createOpen,
  onCloseCreate,
  generateOpen,
  onCloseGenerate,
  onModeChange,
  dissolved = false,
}: CobrosTabProps) {
  // Receivables live in the shared store so Cobros and Facturación (/billing) stay
  // in sync: a factura issued on either surface is reflected on the other. Create,
  // collect, edit, cancel and generar factura persist through the API; asociar/enviar
  // editar datos fiscales is still optimistic-local (via applyReceivable).
  const {
    receivables: data,
    applyReceivable,
    createReceivable,
    collectReceivable,
    updateReceivable,
    cancelReceivable,
    generateInvoice,
    generateMonthlyFees,
    associateInvoice,
    markInvoiceSent,
  } = useReceivables()
  // Below desktop the detail is a covering bottom Sheet, so the list navigator header
  // must not appear behind it (the reflow pushes the visible strip around the sheet),
  // and the period control must travel INTO the detail (see the `periodControl` prop).
  const belowDesktop = useIsBelowDesktop()
  const [dialog, setDialog] = useState<CobrosInvoiceDialog>({ kind: 'none' })
  const [cancelTarget, setCancelTarget] = useState<Receivable | null>(null)

  const closeDialog = useCallback(() => setDialog({ kind: 'none' }), [])

  // On period change, re-resolve the selection to the same client in the new period
  // (the receivable id differs per period) so switching period from the detail keeps
  // the master-detail split open. No match → the stale id stays selected and the
  // layout shows the empty detail rather than dropping to the table. Idempotent: a
  // same-period selection resolves to itself, so this is a no-op outside a switch.
  useEffect(() => {
    if (selectedId == null) return
    const current = data.find((receivable) => receivable.id === selectedId)
    if (!current) return
    const next = data.find(
      (receivable) =>
        receivable.period === selectedPeriod && receivable.clientName === current.clientName,
    )
    if (next && next.id !== selectedId) onSelect(next.id)
  }, [selectedPeriod, selectedId, data, onSelect])

  // Destructive cancel: confirm via AlertDialog (feedback §7), then persist the
  // cancel (POST /receivables/:id/cancel); the store drops it from the list.
  async function confirmCancel() {
    if (!cancelTarget) return
    const target = cancelTarget
    setCancelTarget(null)
    try {
      await cancelReceivable(target.id)
      toast.success('Cobro cancelado')
    } catch {
      toast.error('No se pudo cancelar el cobro')
    }
  }

  const rowActions = useMemo<CobrosRowActions>(
    () => ({
      onView: (receivable) => onSelect(receivable.id),
      onGenerateInvoice: (receivable) => setDialog({ kind: 'generate', receivable }),
      onAssociateInvoice: (receivable) => setDialog({ kind: 'associate', receivable }),
      onSendStatement: (receivable) => setDialog({ kind: 'send', receivable }),
      onMarkCollected: (receivable) => setDialog({ kind: 'collect', receivable }),
      onEdit: (receivable) => setDialog({ kind: 'edit', receivable }),
      onCancel: (receivable) => setCancelTarget(receivable),
    }),
    [onSelect],
  )

  const columns = useMemo(() => cobrosColumns(rowActions), [rowActions])
  const periodData = useMemo(
    () => data.filter((receivable) => receivable.period === selectedPeriod),
    [data, selectedPeriod],
  )
  const kpis = useMemo(() => cobrosKpis(periodData), [periodData])

  // F1 (tablet): the 11-column collections grid overflows the narrowed content
  // column below desktop, pushing "Monto a cobrar" and the trailing columns off the
  // right edge. Seed the low-value columns hidden below desktop so the high-value
  // ones (Cliente, Monto, Estado, Vencimiento) plus the pinned actions fit without
  // overflow; all stay re-addable via the "Ver columnas" menu. Desktop is unchanged.
  const initialColumnVisibility = {
    // The lane is already on every amount cell; this column exists so the Moneda filter
    // has a column id to target.
    currency: false,
    ...(belowDesktop
      ? {
          period: false,
          service: false,
          billingStatus: false,
          collectedAmount: false,
          balance: false,
          taxProfileId: false,
          lastActivity: false,
        }
      : {}),
  }

  const selected = periodData.find((receivable) => receivable.id === selectedId) ?? null
  const layoutSelectedId = inDetail ? (selected ? selectedId : '__cobros-empty__') : null

  // Navigator header (`list`), shown only while a record is open (`inDetail`).
  // In table mode the page's PageHeader carries the title; on mobile the list is
  // the full-width base under that PageHeader — so this is gated on `inDetail` to
  // avoid duplicating the title.
  const header = <SectionHeader title="Cobros" breadcrumb={breadcrumb} actions={periodControl} />

  const tableInner =
    periodData.length === 0 ? (
      <CobrosEmpty />
    ) : (
      <div className="flex flex-col gap-4 md:gap-6">
        {/* §6 master-view focal → Saldo pendiente (the outstanding to collect). */}
        <div className="flex flex-col gap-4 px-4 md:px-6 lg:px-8 desktop:px-10">
          {/* ONE card, TWO co-equal heroes — Saldo pendiente per lane. See the /pagos
              twin for the governance reasoning. What is specific here: the pair measures
              the SALDO, not the period total, because that is what this screen's hero has
              always measured and a pair has to be the same question in two lanes. */}
          <KpiSummaryCard
            figures={kpis}
            heroId={COBROS_HERO_IDS}
            collapsible
            storageKey="cobros"
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
            getRowId={(receivable) => receivable.id}
            onRowClick={(receivable) => onSelect(receivable.id)}
            toolbar={(table) => <CobrosToolbar table={table} />}
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
        detailTitle="Detalle del cobro"
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
            <CobrosList receivables={periodData} selectedId={selectedId} onSelect={onSelect} />
          </>
        }
        detail={
          selected ? (
            <CobrosDetail
              receivable={selected}
              allReceivables={data}
              onClose={onClose}
              onGenerateInvoice={(receivable) => setDialog({ kind: 'generate', receivable })}
              onAssociateInvoice={(receivable) => setDialog({ kind: 'associate', receivable })}
              onMarkCollected={(receivable) => setDialog({ kind: 'collect', receivable })}
              onEditFiscalData={() => setDialog({ kind: 'fiscal', receivable: selected })}
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
            <CobranzaDetailEmpty label="Seleccioná un cobro para ver el detalle" onClose={onClose} />
          )
        }
      />

      {dialog.kind === 'generate' ? (
        <CobrosGenerarFacturaDialog
          receivable={dialog.receivable}
          onGenerate={(id, emitterId) => generateInvoice(id, emitterId).then(() => undefined)}
          onClose={closeDialog}
          onEditFiscalData={(receivable) => setDialog({ kind: 'fiscal', receivable })}
        />
      ) : null}
      {dialog.kind === 'associate' ? (
        <CobrosAsociarFacturaDialog
          receivable={dialog.receivable}
          existingInvoiceNumbers={data
            .filter((row) => row.id !== dialog.receivable.id)
            .map((row) => row.invoiceNumber)
            .filter((value): value is string => Boolean(value))}
          onAssociate={(id, invoiceNumber, issuedAt) =>
            associateInvoice(id, invoiceNumber, issuedAt).then(() => undefined)}
          onClose={closeDialog}
        />
      ) : null}
      {dialog.kind === 'send' ? (
        <CobrosEnviarFacturaDialog
          receivable={dialog.receivable}
          onSend={(id) => markInvoiceSent(id).then(() => undefined)}
          onClose={closeDialog}
        />
      ) : null}
      {dialog.kind === 'collect' ? (
        <CobrosRegistrarCobroDialog
          receivable={dialog.receivable}
          onCollect={async (amount, collectedAt, treasuryAccountId) => {
            await collectReceivable(dialog.receivable.id, amount, collectedAt, treasuryAccountId)
          }}
          onClose={closeDialog}
        />
      ) : null}
      {dialog.kind === 'edit' ? (
        <CobrosEditCobroDialog
          receivable={dialog.receivable}
          onSave={async (input) => {
            await updateReceivable(dialog.receivable.id, input)
          }}
          onClose={closeDialog}
        />
      ) : null}
      {dialog.kind === 'fiscal' ? (
        <CobrosEditFiscalDataDialog
          receivable={dialog.receivable}
          onApply={applyReceivable}
          onClose={closeDialog}
        />
      ) : null}
      {createOpen ? (
        <CobrosCreateCobroDialog
          period={selectedPeriod}
          onCreate={async (input) => {
            await createReceivable(input)
          }}
          onClose={() => onCloseCreate?.()}
        />
      ) : null}

      {generateOpen ? (
        <CobrosGenerarMesDialog
          period={selectedPeriod}
          onGenerate={generateMonthlyFees}
          onClose={() => onCloseGenerate?.()}
        />
      ) : null}

      {cancelTarget ? (
        <AlertDialog open onOpenChange={(open) => (open ? undefined : setCancelTarget(null))}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancelar cobro</AlertDialogTitle>
              <AlertDialogDescription>
                El cobro de {cancelTarget.clientName} por{' '}
                {formatMoney(cancelTarget.totalAmount, cancelTarget.currency)} quedará cancelado. Esta acción no se
                puede deshacer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setCancelTarget(null)}>Volver</AlertDialogCancel>
              <AlertDialogAction color="danger" onClick={confirmCancel}>
                Cancelar cobro
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </>
  )
}

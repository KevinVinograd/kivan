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

function CobrosColumnsMenu({ table }: { table: Table<Receivable> }) {
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
  breadcrumb?: ReactNode
  periodControl?: ReactNode
  createOpen?: boolean
  onCloseCreate?: () => void
  generateOpen?: boolean
  onCloseGenerate?: () => void
  onModeChange?: (mode: 'table' | 'split') => void
  dissolved?: boolean
}

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
  const belowDesktop = useIsBelowDesktop()
  const [dialog, setDialog] = useState<CobrosInvoiceDialog>({ kind: 'none' })
  const [cancelTarget, setCancelTarget] = useState<Receivable | null>(null)

  const closeDialog = useCallback(() => setDialog({ kind: 'none' }), [])

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

  const initialColumnVisibility = {
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

  const header = <SectionHeader title="Cobros" breadcrumb={breadcrumb} actions={periodControl} />

  const tableInner =
    periodData.length === 0 ? (
      <CobrosEmpty />
    ) : (
      <div className="flex flex-col gap-4 md:gap-6">
        <div className="flex flex-col gap-4 px-4 md:px-6 lg:px-8 desktop:px-10">
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

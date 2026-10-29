import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import type { FilterFn } from '@tanstack/react-table'

import { PageHeader, PageContent, MasterDetailLayout, SectionHeader } from '@/app/components/templates'
import { TooltipProvider } from '@/app/components/components'
import { DataTable, KpiSummaryCard } from '@/app/components/patterns'
import { useIsBelowDesktop } from '@/app/lib/use-is-mobile'
import { useHeaderOffset } from '@/app/lib/use-header-offset'
import { cn } from '@/app/lib/utils'
import { motionClass } from '@/app/lib/motion'
import { trailToHere } from '@/app/lib/nav-trail'
import { TrailBreadcrumb } from './trail-breadcrumb'
import { cobranzaPeriods, currentCobranzaPeriod, type CobranzaPeriod } from './cobranza-periods'
import { readPeriodParam } from '@/app/lib/periods'
import { CobranzaError, CobranzaLoading, CobranzaEmptyFiltered } from './cobranza-states'
import { CobranzaDetailEmpty } from './cobranza-detail-ui'
import { CobrosList } from './cobros-list'
import { receivableSearchText } from './cobros-format'
import { useReceivables } from './receivables-data'
import { billingColumns, type BillingRowActions } from './billing-columns'
import { BILLING_HERO_IDS, billingKpis } from './billing-format'
import { BillingMonotributosPanel } from './billing-monotributos-panel'
import { BillingDetail } from './billing-detail'
import { BillingEmpty } from './billing-states'
import { BillingPeriodControls, BillingToolbar } from './billing-toolbar'
import { CobrosGenerarFacturaDialog } from './cobros-generar-factura-dialog'
import { CobrosAsociarFacturaDialog } from './cobros-asociar-factura-dialog'
import { CobrosEnviarFacturaDialog } from './cobros-enviar-factura-dialog'
import { CobrosEditFiscalDataDialog } from './cobros-edit-fiscal-dialog'
import type { Receivable } from './cobros-mock-data'

type LoadStatus = 'loading' | 'ready' | 'error'

type BillingDialog =
  | { kind: 'none' }
  | { kind: 'generate'; receivable: Receivable }
  | { kind: 'associate'; receivable: Receivable }
  | { kind: 'send'; receivable: Receivable }
  | { kind: 'fiscal'; receivable: Receivable }

const globalFilterFn: FilterFn<Receivable> = (row, _columnId, value) =>
  receivableSearchText(row.original).includes(String(value).toLowerCase())

export function BillingPage() {
  const {
    receivables,
    applyReceivable,
    generateInvoice,
    associateInvoice,
    markInvoiceSent,
    isFetching,
    isError,
    refetch,
  } = useReceivables()
  const [searchParams] = useSearchParams()
  const belowDesktop = useIsBelowDesktop()

  const deepLinkOpen = searchParams.get('open')
  const deepLinkPeriod = searchParams.get('period')
  const initialPeriod: CobranzaPeriod = readPeriodParam(deepLinkPeriod) ?? currentCobranzaPeriod()

  const [selectedId, setSelectedId] = useState<string | null>(deepLinkOpen ?? null)
  const [selectedPeriod, setSelectedPeriod] = useState<CobranzaPeriod>(initialPeriod)
  const [dialog, setDialog] = useState<BillingDialog>({ kind: 'none' })
  const [mode, setMode] = useState<'table' | 'split'>('table')
  const [headerRef, regionRef] = useHeaderOffset<HTMLDivElement, HTMLDivElement>()

  const status: LoadStatus = isFetching ? 'loading' : isError ? 'error' : 'ready'

  useEffect(() => {
    if (status !== 'ready') setMode('table')
  }, [status])

  useEffect(() => {
    setSelectedId((prev) => {
      if (prev == null) return null
      const current = receivables.find((receivable) => receivable.id === prev)
      if (!current) return prev
      const next = receivables.find(
        (receivable) =>
          receivable.period === selectedPeriod && receivable.clientName === current.clientName,
      )
      return next ? next.id : prev
    })
  }, [selectedPeriod, receivables])

  const inDetail = status === 'ready' && selectedId !== null
  const closeDetail = () => setSelectedId(null)
  const closeDialog = () => setDialog({ kind: 'none' })
  const onSelect = (id: string) => setSelectedId((prev) => (prev === id ? null : id))

  const rowActions = useMemo<BillingRowActions>(
    () => ({
      onView: (receivable) => onSelect(receivable.id),
      onGenerateInvoice: (receivable) => setDialog({ kind: 'generate', receivable }),
      onAssociateInvoice: (receivable) => setDialog({ kind: 'associate', receivable }),
      onSend: (receivable) => setDialog({ kind: 'send', receivable }),
      onEditFiscalData: (receivable) => setDialog({ kind: 'fiscal', receivable }),
    }),
    [],
  )

  const columns = useMemo(() => billingColumns(rowActions), [rowActions])
  const periodData = useMemo(
    () => receivables.filter((receivable) => receivable.period === selectedPeriod),
    [receivables, selectedPeriod],
  )
  const kpis = useMemo(() => billingKpis(periodData), [periodData])

  const selected = periodData.find((receivable) => receivable.id === selectedId) ?? null
  const layoutSelectedId = inDetail ? (selected ? selectedId : '__billing-empty__') : null

  const periods = useMemo(
    () => cobranzaPeriods(receivables.map((row) => row.period)),
    [receivables],
  )

  const periodControl = (
    <BillingPeriodControls selectedPeriod={selectedPeriod} periods={periods} onSelectPeriod={setSelectedPeriod} />
  )

  const trail = trailToHere(searchParams, '/billing')
  const breadcrumbNode = <TrailBreadcrumb trail={trail} leaf="Facturación" />

  const navigatorHeader = (
    <SectionHeader title="Facturación" actions={periodControl} breadcrumb={breadcrumbNode} />
  )

  const dissolved = status === 'ready' && (inDetail || mode === 'split') && !belowDesktop
  const headerDissolved = inDetail && !belowDesktop

  let tableInner
  if (periodData.length === 0) {
    tableInner = <BillingEmpty />
  } else {
    tableInner = (
      <div className="flex flex-col gap-4 md:gap-6">
        <BillingMonotributosPanel />
        <div className="flex flex-col gap-4 px-4 md:px-6 lg:px-8 desktop:px-10">
          <KpiSummaryCard
            figures={kpis}
            heroId={BILLING_HERO_IDS}
            collapsible
            storageKey="billing"
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
            initialColumnVisibility={{ currency: false }}
            globalFilterFn={globalFilterFn}
            getRowId={(receivable) => receivable.id}
            onRowClick={(receivable) => onSelect(receivable.id)}
            toolbar={(table) => <BillingToolbar table={table} />}
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
  }

  let body
  if (status === 'loading') {
    body = <CobranzaLoading storageKey="billing" />
  } else if (status === 'error') {
    body = <CobranzaError onRetry={refetch} />
  } else {
    body = (
      <MasterDetailLayout
        selectedId={layoutSelectedId}
        detailType="medium"
        onModeChange={setMode}
        onCloseDetail={closeDetail}
        detailTitle="Detalle del comprobante"
        table={
          <div className={cn('flex flex-col', dissolved && 'pt-[var(--md-table-offset)]')}>
            {tableInner}
          </div>
        }
        list={
          <>
            {inDetail && !belowDesktop ? navigatorHeader : null}
            <CobrosList receivables={periodData} selectedId={selectedId} onSelect={onSelect} />
          </>
        }
        detail={
          selected ? (
            <BillingDetail
              receivable={selected}
              onClose={closeDetail}
              onGenerateInvoice={(receivable) => setDialog({ kind: 'generate', receivable })}
              onAssociateInvoice={(receivable) => setDialog({ kind: 'associate', receivable })}
              onSend={(receivable) => setDialog({ kind: 'send', receivable })}
              onEditFiscalData={(receivable) => setDialog({ kind: 'fiscal', receivable })}
              periodControl={belowDesktop ? periodControl : undefined}
            />
          ) : (
            <CobranzaDetailEmpty label="Seleccioná un comprobante para ver el detalle" onClose={closeDetail} />
          )
        }
      />
    )
  }

  return (
    <TooltipProvider>
      <div ref={regionRef} className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={headerRef}
          className={cn(motionClass('content-dissolve'), dissolved && 'pointer-events-none')}
          data-dissolved={headerDissolved ? 'true' : undefined}
          inert={dissolved ? '' : undefined}
        >
          <PageHeader
            eyebrow="Hold"
            eyebrowHidden
            title="Facturación"
            description="Generá comprobantes, controlá monotributos y el estado ARCA del mes."
            breadcrumb={trail.length > 0 ? breadcrumbNode : undefined}
            controls={
              status === 'ready' ? (
                <BillingPeriodControls selectedPeriod={selectedPeriod} periods={periods} onSelectPeriod={setSelectedPeriod} />
              ) : undefined
            }
          />
        </div>
        <div className={cn('flex min-h-0 flex-col', dissolved ? 'absolute inset-0' : 'flex-1')}>
          <PageContent>{body}</PageContent>
        </div>
      </div>

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
          existingInvoiceNumbers={receivables
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
      {dialog.kind === 'fiscal' ? (
        <CobrosEditFiscalDataDialog
          receivable={dialog.receivable}
          onApply={applyReceivable}
          onClose={closeDialog}
        />
      ) : null}
    </TooltipProvider>
  )
}

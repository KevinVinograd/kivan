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

/** Which facturación dialog is open (the page owns this state). */
type BillingDialog =
  | { kind: 'none' }
  | { kind: 'generate'; receivable: Receivable }
  | { kind: 'associate'; receivable: Receivable }
  | { kind: 'send'; receivable: Receivable }
  | { kind: 'fiscal'; receivable: Receivable }

const globalFilterFn: FilterFn<Receivable> = (row, _columnId, value) =>
  receivableSearchText(row.original).includes(String(value).toLowerCase())

/**
 * Facturación module (`/billing`) — the standalone invoicing workspace. Lists the
 * period's cobros through the facturación lens (estado de facturación, monotributo
 * emisor, comprobante) over a master-detail surface, with the three monotributos
 * and the §8.5 facturación resumen on top. The §9 subflow dialogs (generar /
 * asociar / enviar / editar datos fiscales) are reused as-is and write to the
 * shared Receivables store, so a factura issued here also shows on `/cobros`.
 * Follows the Cobros master-detail blueprint: a `PageHeader` (title + period
 * cluster) over a `MasterDetailLayout`; on desktop the header dissolves in place
 * when a record is open — it keeps its height, so nothing below it reflows.
 * Deep links seed the open record (`?open=<id>`) and period (`?period=`).
 */
export function BillingPage() {
  // Facturación reads the SAME receivables store as Cobros, which already exposes the real
  // `isFetching` / `isError` / `refetch` from `GET /receivables`. This page used to destructure
  // only `receivables` and drive its load state off a `setTimeout(400)` wired to nothing — so a
  // failed fetch rendered a confident "Todavía no hay comprobantes" (indistinguishable from an
  // outage) and the error screen below was unreachable dead code.
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
  // Below desktop the detail is a covering bottom Sheet, so the page header and the
  // list navigator header must not restructure behind it (the reflow pushes the strip),
  // and the period control must travel INTO the detail (see the `periodControl` prop).
  const belowDesktop = useIsBelowDesktop()

  const deepLinkOpen = searchParams.get('open')
  const deepLinkPeriod = searchParams.get('period')
  // Normalized, not merely validated — see `readPeriodParam`. The old check against the
  // frozen three-month array made a link to any other month fall back to the pinned default.
  const initialPeriod: CobranzaPeriod = readPeriodParam(deepLinkPeriod) ?? currentCobranzaPeriod()

  const [selectedId, setSelectedId] = useState<string | null>(deepLinkOpen ?? null)
  const [selectedPeriod, setSelectedPeriod] = useState<CobranzaPeriod>(initialPeriod)
  const [dialog, setDialog] = useState<BillingDialog>({ kind: 'none' })
  // Effective master-detail mode reported by MasterDetailLayout. It trails the panel
  // exit (stays 'split' until the split actually collapses), so the PageHeader fades
  // back in lockstep with the exit instead of mid-exit.
  const [mode, setMode] = useState<'table' | 'split'>('table')
  // While the split is open the content layer fills the whole region over the faded
  // header, so the table dissolving out is offset back down by the header height
  // (published as `--md-table-offset`, consumed by the table slot) to stay anchored —
  // no lurch as it fades. The list/detail still fill from the top.
  const [headerRef, regionRef] = useHeaderOffset<HTMLDivElement, HTMLDivElement>()

  // isFetching FIRST: the initial load and a "Reintentar" refetch both show the skeleton.
  // react-query keeps `isError` true during a refetch, so checking it first would freeze the
  // error screen and make the retry button look inert. Same derivation as cobranza-page.
  const status: LoadStatus = isFetching ? 'loading' : isError ? 'error' : 'ready'

  // Unlike clients/team, this page UNMOUNTS MasterDetailLayout outside the ready
  // state (the loading/error branch replaces it), and an unmount never reports a
  // mode — so `mode` would strand at 'split'. Reset it so a reload can never leave
  // the page in the dissolved layout with a visible header under it.
  useEffect(() => {
    if (status !== 'ready') setMode('table')
  }, [status])

  // On period change, keep the same client selected instead of clearing — switching
  // period from the detail must not collapse the master-detail back to the table.
  // The receivable id differs per period, so re-resolve it by client; when the
  // client has no record in the new period, keep the stale id so the layout stays in
  // the split (showing the empty detail) rather than dropping to the table.
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

  // In detail mode the PageHeader (with its period cluster) is dissolved and inert, so
  // the period switch carries over via the same full Select. On desktop it sits in the
  // navigator (panel 1) section header; on mobile, where the detail opens in a Sheet
  // that covers the navigator, it moves into the detail header instead. The header's
  // own Select stays in the DOM but is unreachable — this duplicate is the reachable one.
  // The months to offer: the rolling window plus every month the loaded receivables carry,
  // so a record outside the window stays reachable rather than invisible.
  const periods = useMemo(
    () => cobranzaPeriods(receivables.map((row) => row.period)),
    [receivables],
  )

  const periodControl = (
    <BillingPeriodControls selectedPeriod={selectedPeriod} periods={periods} onSelectPeriod={setSelectedPeriod} />
  )

  // Contextual back-trail when deep-linked (e.g. from the Admin dashboard); empty
  // for direct nav, so no breadcrumb renders. Threaded into the PageHeader (table
  // view) and the navigator SectionHeader (detail view, where the PageHeader is
  // dissolved and inert, so only the navigator's copy is reachable).
  const trail = trailToHere(searchParams, '/billing')
  const breadcrumbNode = <TrailBreadcrumb trail={trail} leaf="Facturación" />

  const navigatorHeader = (
    <SectionHeader title="Facturación" actions={periodControl} breadcrumb={breadcrumbNode} />
  )

  // Desktop-only: while the master-detail split is open the PageHeader dissolves IN
  // PLACE (blur + fade + scale-recede) and no longer collapses its height, so nothing
  // below it reflows — just a fade, nothing moves. The content region then extends up
  // to fill the whole area over the covered header band, so the split still reaches
  // full height with no empty gap. Below desktop the detail opens in a bottom Sheet,
  // so the header stays put (never dissolves) there.
  //
  // Two flags: `dissolved` (LAYOUT) trails the exit via `mode` so the content layer
  // stays lifted until the split finishes collapsing. `headerDissolved` (the VISUAL
  // fade) instead drops the moment the selection clears, so the header fades back in
  // IN LOCKSTEP with the returning table rather than trailing it. The extra
  // `status === 'ready'` term is billing-specific: the layout is unmounted outside
  // the ready state, so `mode` must not be trusted on its own there.
  const dissolved = status === 'ready' && (inDetail || mode === 'split') && !belowDesktop
  const headerDissolved = inDetail && !belowDesktop

  let tableInner
  if (periodData.length === 0) {
    tableInner = <BillingEmpty />
  } else {
    tableInner = (
      <div className="flex flex-col gap-4 md:gap-6">
        <BillingMonotributosPanel />
        {/* §6 focal figure: Pendiente de facturar — the action figure the billing
            lens exists to answer. Error ARCA stays a supporting tile and keeps the
            viewport's single tint when nonzero (see billingKpis). */}
        <div className="flex flex-col gap-4 px-4 md:px-6 lg:px-8 desktop:px-10">
          {/* ONE card, TWO co-equal heroes — the same treatment /cobros and /pagos give
              the lane, on the same receivables. `pagos-tab.tsx` carries the governance
              reasoning. */}
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
            // The lane is already on every `Monto` cell; the column exists so the
            // Moneda filter has an id to target.
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
        // The offset rides the SLOT wrapper, not the DataTable's own gutter div: the
        // slot also holds the monotributos panel and the KPI card, and the whole
        // stack has to shift down as one block to stay anchored under the faded
        // header. Each child keeps owning its own horizontal gutter.
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

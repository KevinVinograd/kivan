import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'

import { PageHeader, PageContent } from '@/app/components/templates'
import { useRole } from '@/app/lib/use-role'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TooltipProvider,
} from '@/app/components/components'
import { AFFORDANCE, ICON } from '@/app/lib/icon-registry'
import { cn } from '@/app/lib/utils'
import { motionClass } from '@/app/lib/motion'
import { useIsBelowDesktop } from '@/app/lib/use-is-mobile'
import { useHeaderOffset } from '@/app/lib/use-header-offset'
import { trailToHere } from '@/app/lib/nav-trail'
import { formatMonthYear } from './cobranza-format'
import { cobranzaPeriods, currentCobranzaPeriod, type CobranzaPeriod } from './cobranza-periods'
import { readPeriodParam } from '@/app/lib/periods'
import { CobranzaError, CobranzaLoading } from './cobranza-states'
import { useReceivables } from './receivables-data'
import { usePayments } from './payments-data'
import { CobrosTab } from './cobros-tab'
import { PagosTab } from './pagos-tab'

type LoadStatus = 'loading' | 'ready' | 'error'
type FinanceKind = 'cobros' | 'pagos'

/** Per-page copy + the contextual create action label. Cobros and Pagos are two
 *  distinct pages (routes `/cobros` and `/pagos`); they share the period model,
 *  the simulated load, and the master-detail shell below. */
const PAGE_CONFIG: Record<FinanceKind, { title: string; description: string; actionLabel: string }> = {
  cobros: {
    title: 'Cobros',
    description: 'Gestioná los cobros a clientes y su facturación del mes.',
    actionLabel: 'Nuevo cobro',
  },
  pagos: {
    title: 'Pagos',
    description: 'Gestioná los pagos al equipo y a proveedores del mes.',
    actionLabel: 'Nuevo pago',
  },
}

/** Period selector (full Select), rendered both in the page header controls slot
 *  and — in the detail view, where the PageHeader is dissolved and inert — in the navigator
 *  section header. The prev/next stepper chevrons were removed; the dropdown drives
 *  all period changes. Full Select on every viewport (no below-desktop icon collapse). */
function FinancePeriodControls({
  selectedPeriod,
  periods,
  onSelectPeriod,
}: {
  selectedPeriod: CobranzaPeriod
  /** Derived per render, never a module constant — see `lib/periods.ts`. */
  periods: CobranzaPeriod[]
  onSelectPeriod: (period: CobranzaPeriod) => void
}) {
  return (
    <Select value={selectedPeriod} onValueChange={(value) => onSelectPeriod(value as CobranzaPeriod)}>
      <SelectTrigger aria-label="Seleccionar período">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {periods.map((period) => (
          <SelectItem key={period} value={period}>
            {formatMonthYear(period)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/**
 * Finance module page — the shared shell behind the two standalone routes
 * `/cobros` (CobrosPage) and `/pagos` (PagosPage). Follows the Clients/Team
 * master-detail blueprint: a default `PageHeader` (title + subtitle + the period
 * cluster and contextual create action) over a `MasterDetailLayout`; on desktop the
 * header dissolves in place when a record is open — it keeps its height, so nothing
 * below it reflows. The MasterDetailLayout itself lives in the child tab, so the
 * mode report is threaded up and the dissolved flag back down. The page owns the
 * period, the simulated load
 * status, and the single selection. Deep links from Reportes (`?open=<id>`,
 * `?period=`, `?trail=`) seed the detail, period, and an accumulated breadcrumb
 * back to wherever the user came from. The facturación subflow (§9) lives inside
 * Cobros; cuentas corrientes (§13) land later.
 */
function FinanceModulePage({ kind }: { kind: FinanceKind }) {
  const config = PAGE_CONFIG[kind]
  const { canDo } = useRole()
  const [searchParams] = useSearchParams()
  // Deep link from Reportes → Finanzas: `?open=<id>` seeds the record detail,
  // `?period=` selects the period (so an off-current record resolves in its list),
  // `?trail=` shows the accumulated back-breadcrumb. Applied on mount.
  const deepLinkOpen = searchParams.get('open')
  const deepLinkPeriod = searchParams.get('period')
  // NORMALIZED, not merely validated: a shape-valid but non-canonical value ('2026-07',
  // '2026-07-15') matches no option and no row, leaving a blank selector over an empty month.
  // It used to be checked against the frozen three-month array, so a link to any real month
  // silently fell back to the pinned default and landed the reader on the wrong one.
  const initialPeriod: CobranzaPeriod = readPeriodParam(deepLinkPeriod) ?? currentCobranzaPeriod()
  // Contextual back-trail accumulated in the URL (`?trail=`): every step the user
  // passed through to deep-link a record here (a Reportes → Finanzas row, a client's
  // facturación record, or a Cuentas corrientes movement), so they can step back to
  // any of them. `trailToHere` collapses a loop back to this page so it never
  // duplicates the leaf and a round trip does not leave a misleading parent chain.
  const trail = trailToHere(searchParams, `/${kind}`)

  const [selectedId, setSelectedId] = useState<string | null>(deepLinkOpen ?? null)
  const [selectedPeriod, setSelectedPeriod] = useState<CobranzaPeriod>(initialPeriod)
  const [createOpen, setCreateOpen] = useState(false)
  // Cobros only: the month's retainers, generated in one action instead of retyped.
  const [generateOpen, setGenerateOpen] = useState(false)

  // Both tabs now drive their load status from the store that actually feeds them: Cobros
  // from the receivables query, Pagos from the payments store. Pagos used to fake it with
  // `setTimeout(() => setPagosTimerReady(true), 400)`, which flipped to ready whether the
  // fetch had succeeded, was in flight, or had failed — so its error state was unreachable
  // and a `GET /payments` outage rendered a reassuring empty table. See the convention
  const receivables = useReceivables()
  const payments = usePayments()

  // Loading BEFORE error, in both branches. The initial load AND a "Reintentar" refetch must
  // both show the skeleton: react-query keeps status='error' through a refetch (and the
  // payments store's `isLoading` is likewise true during one), so testing the error first
  // would freeze the error screen and leave the retry button looking inert.
  const status: LoadStatus =
    kind === 'cobros'
      ? receivables.isFetching
        ? 'loading'
        : receivables.isError
          ? 'error'
          : 'ready'
      : payments.isLoading
        ? 'loading'
        : payments.isError
          ? 'error'
          : 'ready'

  // On period change the selection is NOT cleared here — each tab re-resolves the
  // selected record to the same entity in the new period, so switching period from
  // the detail keeps the master-detail split open instead of dropping to the table.

  // Below desktop the detail is a covering bottom Sheet, so the page header must not
  // dissolve behind it (the reflow pushes the visible strip around the sheet).
  const belowDesktop = useIsBelowDesktop()
  const inDetail = status === 'ready' && selectedId !== null
  const closeDetail = () => setSelectedId(null)

  // Desktop-only: while the master-detail split is open the PageHeader dissolves IN
  // PLACE (blur + fade + scale-recede) and no longer collapses its height, so nothing
  // below it reflows. The content region then extends up to fill the whole area over
  // the covered header band.
  //
  // The split ownership is the wrinkle here: the PageHeader lives in THIS shell, but
  // the MasterDetailLayout lives in the child tab (CobrosTab / PagosTab). So `mode` is
  // owned here and fed by the tab's `onModeChange`, while `dissolved` is fed back DOWN
  // so the tab's table slot can consume `--md-table-offset` (published on the region
  // node below — custom properties inherit, and the region is the slot's ancestor).
  //
  // Two flags: `dissolved` (LAYOUT) trails the exit via `mode` so the content layer
  // stays lifted until the split finishes collapsing. `headerDissolved` (the VISUAL
  // fade) drops the moment the selection clears, so the header fades back in IN
  // LOCKSTEP with the returning table. The `status === 'ready'` term matters because
  // the tab (and with it the layout) is unmounted in the loading/error branch, and an
  // unmount never reports a mode.
  const [mode, setMode] = useState<'table' | 'split'>('table')
  const [headerRef, regionRef] = useHeaderOffset<HTMLDivElement, HTMLDivElement>()
  const dissolved = status === 'ready' && (inDetail || mode === 'split') && !belowDesktop
  const headerDissolved = inDetail && !belowDesktop

  useEffect(() => {
    if (status !== 'ready') setMode('table')
  }, [status])

  // Contextual back-breadcrumb, shown only when the user arrived via a deep link
  // carrying a trail. Threaded into the PageHeader (table view) and the navigator's
  // SectionHeader (detail view, where the PageHeader is dissolved and inert, so only
  // the navigator copy is reachable).
  const breadcrumbNode = trail.length > 0 ? (
    <Breadcrumb>
      <BreadcrumbList>
        {trail.map((crumb, index) => (
          <Fragment key={`${crumb.to}-${index}`}>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to={crumb.to}>{crumb.label}</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
          </Fragment>
        ))}
        <BreadcrumbItem>
          <BreadcrumbPage>{config.title}</BreadcrumbPage>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  ) : null

  const onSelect = useCallback((id: string) => setSelectedId((prev) => (prev === id ? null : id)), [])

  // The months to offer: the rolling window, plus every month the LOADED rows actually
  // carry, so a record outside the window is still reachable rather than invisible.
  const periods = useMemo(
    () =>
      cobranzaPeriods(
        kind === 'cobros'
          ? receivables.receivables.map((row) => row.period)
          : payments.payments.map((row) => row.period),
      ),
    [kind, receivables.receivables, payments.payments],
  )

  // Period selector for the navigator header (detail view, where the PageHeader
  // period cluster is dissolved and inert) — the same full Select as the header, so the period
  // switch never reverts to a calendar icon when a record is open.
  const periodControl = (
    <FinancePeriodControls selectedPeriod={selectedPeriod} periods={periods} onSelectPeriod={setSelectedPeriod} />
  )

  let body
  if (status === 'loading') {
    body = <CobranzaLoading storageKey={kind} />
  } else if (status === 'error') {
    body = (
      <CobranzaError
        onRetry={kind === 'cobros' ? () => receivables.refetch() : () => payments.refetch()}
      />
    )
  } else if (kind === 'cobros') {
    body = (
      <CobrosTab
        selectedPeriod={selectedPeriod}
        selectedId={selectedId}
        onSelect={onSelect}
        onClose={closeDetail}
        inDetail={inDetail}
        breadcrumb={breadcrumbNode}
        periodControl={periodControl}
        createOpen={createOpen}
        onCloseCreate={() => setCreateOpen(false)}
        generateOpen={generateOpen}
        onCloseGenerate={() => setGenerateOpen(false)}
        onModeChange={setMode}
        dissolved={dissolved}
      />
    )
  } else {
    body = (
      <PagosTab
        selectedPeriod={selectedPeriod}
        selectedId={selectedId}
        onSelect={onSelect}
        onClose={closeDetail}
        inDetail={inDetail}
        breadcrumb={breadcrumbNode}
        periodControl={periodControl}
        createOpen={createOpen}
        onCloseCreate={() => setCreateOpen(false)}
        onModeChange={setMode}
        dissolved={dissolved}
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
            breadcrumb={breadcrumbNode ?? undefined}
            title={config.title}
            description={config.description}
            controls={
              status === 'ready' ? (
                <FinancePeriodControls selectedPeriod={selectedPeriod} periods={periods} onSelectPeriod={setSelectedPeriod} />
              ) : undefined
            }
            actions={
              status === 'ready'
                ? [
                    // The month's retainers, generated in one action. Secondary to
                    // "Nuevo cobro" and listed before it so the solid primary keeps the
                    // rightmost slot: this is the monthly ritual, not the default act.
                    ...(kind === 'cobros' && canDo('receivable.generate')
                      ? [
                          {
                            key: 'generate',
                            label: 'Generar cobros del mes',
                            icon: ICON.recurringBilling,
                            variant: 'outlined' as const,
                            leadingIcon: true,
                            mobileIconOnly: true,
                            onClick: () => setGenerateOpen(true),
                          },
                        ]
                      : []),
                    ...(canDo(kind === 'cobros' ? 'receivable.create' : 'payment.create')
                      ? [
                          {
                            key: 'create',
                            label: PAGE_CONFIG[kind].actionLabel,
                            icon: AFFORDANCE.create,
                            variant: 'solid' as const,
                            leadingIcon: true,
                            mobileIconOnly: true,
                            primary: true,
                            onClick: () => setCreateOpen(true),
                          },
                        ]
                      : []),
                  ]
                : undefined
            }
          />
        </div>
        <div className={cn('flex min-h-0 flex-col', dissolved ? 'absolute inset-0' : 'flex-1')}>
          <PageContent>{body}</PageContent>
        </div>
      </div>
    </TooltipProvider>
  )
}

export function CobrosPage() {
  return <FinanceModulePage kind="cobros" />
}

export function PagosPage() {
  return <FinanceModulePage kind="pagos" />
}

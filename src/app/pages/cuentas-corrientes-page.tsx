import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import type { FilterFn, Table } from '@tanstack/react-table'

import { cn } from '@/app/lib/utils'
import { motionClass } from '@/app/lib/motion'
import { AFFORDANCE, ICON } from '@/app/lib/icon-registry'
import { trailToHere } from '@/app/lib/nav-trail'
import { useIsBelowDesktop } from '@/app/lib/use-is-mobile'
import { useHeaderOffset } from '@/app/lib/use-header-offset'
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
  Tabs,
  TabsList,
  TabsTrigger,
  toast,
} from '@/app/components/components'
import { DataTable, Toolbar } from '@/app/components/patterns'
import {
  MasterDetailLayout,
  PageHeader,
  PageContent,
  PanelContent,
  SectionHeader,
} from '@/app/components/templates'
import { useAccountLedger } from './account-ledger-data'
import { useRevalidateTeamOnOpen } from './team-data'
import {
  clientLedgerColumns,
  teamLedgerColumns,
  providerLedgerColumns,
  accountStatusBadge,
} from './account-ledger-columns'
import { exportAccountLedgerCsv, type AccountStatementExportRow } from './account-ledger-export'
import { AccountStatementDetail } from './account-statement-detail'
import { CobranzaDetailEmpty } from './cobranza-detail-ui'
import { TrailBreadcrumb } from './trail-breadcrumb'
import {
  AccountLedgerEmpty,
  AccountLedgerEmptyFiltered,
  AccountLedgerError,
  AccountLedgerLoading,
} from './account-ledger-states'
import { formatCurrency } from './account-ledger-format'
import type { AccountEntity, LedgerEntityType } from './account-ledger-types'

type LoadStatus = 'loading' | 'ready' | 'error'

const nameFilterFn: FilterFn<AccountEntity> = (row, _columnId, value) =>
  row.original.name.toLowerCase().includes(String(value).toLowerCase())

function AccountToolbar({ table }: { table: Table<AccountEntity> }) {
  const globalFilter = (table.getState().globalFilter as string | undefined) ?? ''
  return (
    <Toolbar
      search={{
        value: globalFilter,
        onChange: (value) => table.setGlobalFilter(value),
        placeholder: 'Buscar cuenta',
        label: 'Buscar cuenta corriente',
      }}
    />
  )
}

/** Compact master list shown in the navigator column (detail open) and on mobile. */
function AccountEntityList({
  entities,
  entityType,
  selectedId,
  onSelect,
}: {
  entities: AccountEntity[]
  entityType: LedgerEntityType
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  return (
    <PanelContent layout="stacked" flushTop>
      <div className="flex flex-col gap-1">
        {entities.map((entity) => {
          const badge = accountStatusBadge(entity.status, entityType)
          const active = entity.entityId === selectedId
          return (
            <button
              key={entity.entityId}
              type="button"
              onClick={() => onSelect(entity.entityId)}
              aria-current={active ? 'true' : undefined}
              className={cn(
                'flex items-center justify-between gap-3 rounded-control px-3 py-2 text-left motion-standard',
                active ? 'bg-alpha-subtle-active' : 'hover:bg-alpha-subtle-hover',
              )}
            >
              <div className="flex min-w-0 flex-col">
                <span className="truncate type-button fg-default">{entity.name}</span>
                <span className="tabular-nums type-caption fg-subtle">
                  {formatCurrency(entity.currentBalance)}
                </span>
                {/* The saldo is the PESO lane. The table beside this navigator already
                    says what it leaves out; without the same line here the compact list
                    would be the one surface that scopes the figure and hides the scope. */}
                {entity.otherLaneCount > 0 ? (
                  <span className="truncate type-caption fg-subtle">
                    {entity.otherLaneCount === 1
                      ? '1 movimiento en otra moneda'
                      : entity.otherLaneCount + ' movimientos en otra moneda'}
                  </span>
                ) : null}
              </div>
              <Badge variant={badge.variant}>{badge.label}</Badge>
            </button>
          )
        })}
      </div>
    </PanelContent>
  )
}

const ENTITY_EMPTY_LABEL: Record<LedgerEntityType, string> = {
  client: 'Cuando se generen cobros y facturas vas a ver acá la cuenta corriente de cada cliente.',
  teamMember: 'Cuando se liquiden pagos al equipo vas a ver acá la cuenta corriente de cada colaboradora.',
  provider: 'Cuando se registren pagos a proveedores vas a ver acá la cuenta corriente de cada proveedor.',
}

const ENTITY_TABS: { value: LedgerEntityType; label: string; shortLabel?: string }[] = [
  { value: 'client', label: 'Clientes' },
  { value: 'teamMember', label: 'Colaboradoras', shortLabel: 'Colab' },
  { value: 'provider', label: 'Proveedores', shortLabel: 'Prov' },
]

/**
 * Entity toggle — switches the master list between clients, colaboradoras and
 * proveedores. Rendered twice, once per master surface, because MasterDetailLayout
 * renders exactly one of them in any given state.
 *
 * `compact` is the navigator instance. The full-label strip measures 332px, while
 * the compact rail gives it 300px (at desktop) / 308px (at lg) of content width, so
 * the two long labels shorten at `lg` — the only breakpoint that matters here, since
 * below it the navigator IS the full-width mobile base (358px, where the full labels
 * fit) and between the two the navigator is not rendered at all. The `aria-label`
 * pins the accessible name to the full domain term at every width.
 */
function EntityToggle({
  value,
  onValueChange,
  compact = false,
}: {
  value: LedgerEntityType
  onValueChange: (next: string) => void
  compact?: boolean
}) {
  return (
    <Tabs value={value} onValueChange={onValueChange}>
      <TabsList variant="segmented">
        {ENTITY_TABS.map((tab) => {
          const abbreviated = compact && tab.shortLabel !== undefined
          return (
            <TabsTrigger
              key={tab.value}
              variant="segmented"
              value={tab.value}
              aria-label={abbreviated ? tab.label : undefined}
            >
              {abbreviated ? (
                <>
                  <span className="lg:hidden">{tab.label}</span>
                  <span className="hidden lg:block">{tab.shortLabel}</span>
                </>
              ) : (
                tab.label
              )}
            </TabsTrigger>
          )
        })}
      </TabsList>
    </Tabs>
  )
}

/**
 * Cuentas corrientes (PRD §13) — a dedicated Finanzas surface showing each client,
 * colaboradora and proveedor's running-account history. An entity toggle switches the
 * master list; selecting an account opens its period-by-period statement (expandable
 * to movements). Mock-backed; send is simulated, export is a real CSV download.
 */
export function CuentasCorrientesPage() {
  const { entitiesByType, statementFor, statusFor } = useAccountLedger()
  // Colaboradoras is built from the team store's payout statements.
  useRevalidateTeamOnOpen()
  const [searchParams] = useSearchParams()
  // Contextual back-trail when the surface was reached from a parent context via a
  // deep link (`?trail=`); empty for direct nav, so no breadcrumb renders.
  const trail = trailToHere(searchParams, '/cuentas-corrientes')
  const breadcrumbNode = <TrailBreadcrumb trail={trail} leaf="Cuentas corrientes" />
  const [entityType, setEntityType] = useState<LedgerEntityType>('client')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Effective master-detail mode reported by MasterDetailLayout. It trails the panel
  // exit (stays 'split' until the split actually collapses), so the PageHeader fades
  // back in lockstep with the exit instead of mid-exit.
  const [mode, setMode] = useState<'table' | 'split'>('table')
  // Below desktop the detail opens in a covering bottom Sheet, so the header must NOT
  // dissolve behind it — it stays put as the Sheet's page context. Before this the
  // header was unmounted on every viewport, so the mobile strip reflowed too.
  const belowDesktop = useIsBelowDesktop()
  // While the split is open the content layer fills the whole region over the faded
  // header, so the table dissolving out is offset back down by the header height
  // (published as `--md-table-offset`, consumed by the table slot) to stay anchored.
  const [headerRef, regionRef] = useHeaderOffset<HTMLDivElement, HTMLDivElement>()
  const [confirmSend, setConfirmSend] = useState(false)

  // The load status is the REAL state of the store BEHIND THE OPEN TAB, not a timer.
  // A fixed `setTimeout` would flip to 'ready' whether the fetch succeeded, was still in
  // flight, or failed — and a failed fetch would then render the empty state ("Todavía no
  // hay cuentas corrientes") over an outage, which on a money surface is a false statement
  // of fact. It is scoped per tab because each tab derives from exactly one store, so a
  // Team outage must not black out Clientes (and its retry must not touch Receivables —
  // see `statusFor`). Loading is checked BEFORE error so a retry shows progress instead of
  // holding the error on screen.
  const tabStatus = statusFor(entityType)
  const status: LoadStatus = tabStatus.isLoading ? 'loading' : tabStatus.isError ? 'error' : 'ready'

  // MasterDetailLayout only mounts in the ready state (the loading/error branch
  // replaces it), and an unmount never reports a mode — so `mode` would strand at
  // 'split' and leave the content layer lifted over a visible header. Reset it.
  useEffect(() => {
    if (status !== 'ready') setMode('table')
  }, [status])

  const entities = useMemo(
    () => (status === 'ready' ? entitiesByType(entityType) : []),
    // entitiesByType closes over the current store snapshots; re-run on type/status change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entityType, status],
  )

  const onEntityTypeChange = (next: string) => {
    const nextType = next as LedgerEntityType
    setEntityType(nextType)
    // The toggle now lives inside the navigator, so switching entity type from the
    // split must not collapse it back to the table — nulling the selection would drive
    // `inDetail` false and unmount the whole split under the user's cursor. The account
    // on screen belongs to the old entity type, so hand the detail to the first account
    // of the new one. `entities` has not recomputed on this tick, hence the direct read.
    // The one case that DOES collapse is a new type with no accounts at all: there is no
    // account to open, and the table's empty state carries the copy that explains why.
    setSelectedId((current) =>
      current === null ? null : (entitiesByType(nextType)[0]?.entityId ?? null),
    )
  }

  const columns =
    entityType === 'client'
      ? clientLedgerColumns
      : entityType === 'teamMember'
        ? teamLedgerColumns
        : providerLedgerColumns
  const selected = entities.find((entity) => entity.entityId === selectedId) ?? null
  const inDetail = status === 'ready' && selectedId !== null
  const layoutSelectedId = inDetail ? (selected ? selectedId : '__cuentas-empty__') : null
  const closeDetail = () => setSelectedId(null)

  // Desktop-only: while the master-detail split is open the PageHeader dissolves IN
  // PLACE (blur + fade + scale-recede) and no longer collapses its height, so nothing
  // below it reflows. The content region then extends up to fill the whole area over
  // the covered header band. Below desktop the detail opens in a bottom Sheet, so the
  // header stays put (never dissolves) there.
  //
  // Two flags: `dissolved` (LAYOUT) trails the exit via `mode` so the content layer
  // stays lifted until the split finishes collapsing. `headerDissolved` (the VISUAL
  // fade) drops the moment the selection clears, so the header fades back in IN
  // LOCKSTEP with the returning table. Both key off the raw `inDetail`, never off
  // `selected != null`: with the '__cuentas-empty__' sentinel the split IS open even
  // when no entity matches, and a header re-appearing on top of it would be the bug.
  // These MUST be declared here — `body` below reads `dissolved` at build time.
  const dissolved = status === 'ready' && (inDetail || mode === 'split') && !belowDesktop
  const headerDissolved = inDetail && !belowDesktop

  function exportRows(): AccountStatementExportRow[] {
    return entities.map((entity) => ({
      name: entity.name,
      statements: statementFor(entity.entityId),
    }))
  }

  function handleExport() {
    const rows = exportRows()
    if (rows.length === 0) {
      toast.warning('No hay cuentas corrientes para exportar')
      return
    }
    exportAccountLedgerCsv(entityType, rows)
    toast.success('Exportación generada')
  }

  function handleSendAll() {
    if (entities.length === 0) {
      toast.warning('No hay cuentas corrientes para enviar')
      return
    }
    // Sending to every account of the active type is a bulk, hard-to-undo action:
    // confirm the count before firing rather than sending on a single click.
    setConfirmSend(true)
  }

  function confirmSendAll() {
    // No delivery integration yet, so the toast says the send was simulated.
    toast.success(`Envío simulado de ${entities.length} cuentas corrientes`)
    setConfirmSend(false)
  }

  let body: ReactNode
  if (status !== 'ready') {
    // The toggle stays on screen while loading AND while erroring. The status is scoped
    // to the open tab's store, so one store being down breaks exactly ONE tab — if the
    // error state swallowed the toggle, the user would be TRAPPED on the broken tab with
    // no way back to the two that work, short of reloading the page.
    body = (
      <div className="flex flex-col gap-4">
        <div className="px-4 md:px-6 lg:px-8 desktop:px-10">
          <EntityToggle value={entityType} onValueChange={onEntityTypeChange} />
        </div>
        {status === 'loading' ? (
          <AccountLedgerLoading />
        ) : (
          <AccountLedgerError onRetry={tabStatus.refetch} />
        )}
      </div>
    )
  } else {
    // The entity toggle reads as a section header above the search, kept visible in
    // both the empty and populated states so the user can always switch entity type.
    const tableInner = (
      <div className="flex flex-col gap-4">
        <div className="px-4 md:px-6 lg:px-8 desktop:px-10">
          <EntityToggle value={entityType} onValueChange={onEntityTypeChange} />
        </div>
        {entities.length === 0 ? (
          <AccountLedgerEmpty label={ENTITY_EMPTY_LABEL[entityType]} />
        ) : (
          <div className="px-4 md:px-6 lg:px-8 desktop:px-10">
            <DataTable
              columns={columns}
              data={entities}
              pageSize={20}
              pinActionsColumn
              globalFilterFn={nameFilterFn}
              getRowId={(entity) => entity.entityId}
              onRowClick={(entity) => setSelectedId(entity.entityId)}
              toolbar={(table) => <AccountToolbar table={table} />}
              emptyState={(table) => (
                <AccountLedgerEmptyFiltered onClearFilters={() => table.setGlobalFilter('')} />
              )}
            />
          </div>
        )}
      </div>
    )

    body = (
      <MasterDetailLayout
        selectedId={layoutSelectedId}
        detailType="medium"
        onModeChange={setMode}
        onCloseDetail={closeDetail}
        detailTitle="Detalle de la cuenta corriente"
        // The offset rides the SLOT wrapper: the slot also holds the entity toggle
        // above the table, and the whole stack has to shift down as one block to stay
        // anchored under the faded header. The horizontal gutters live one level down
        // (on the toggle and the DataTable), so only the top padding belongs here.
        table={
          <div className={cn('flex flex-col', dissolved && 'pt-[var(--md-table-offset)]')}>
            {tableInner}
          </div>
        }
        list={
          <>
            {/* The toggle has to be here as well as in the `table` slot, and ungated:
                the desktop split stops rendering `table` altogether, and below md the
                `list` IS the base — so the navigator is the only surface that carries
                the toggle in either of those states. `variant="control"` hands the
                header row to the tab strip (the 300px rail cannot fit a title and the
                strip side by side) while keeping the title for assistive tech. The
                trail breadcrumb stays owned by the PageHeader (table view, where it is
                the only reachable copy) and the detail scaffold (detail view, where the
                PageHeader is dissolved and inert), so it still renders once per state. */}
            <SectionHeader
              variant="control"
              title="Cuentas corrientes"
              leading={
                <div className="min-w-0 overflow-x-auto">
                  <EntityToggle value={entityType} onValueChange={onEntityTypeChange} compact />
                </div>
              }
            />

            <AccountEntityList
              entities={entities}
              entityType={entityType}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </>
        }
        detail={
          selected ? (
            <AccountStatementDetail
              entity={selected}
              statements={statementFor(selected.entityId)}
              breadcrumb={breadcrumbNode}
              onClose={closeDetail}
            />
          ) : (
            <CobranzaDetailEmpty
              label="Seleccioná una cuenta para ver el detalle"
              onClose={closeDetail}
            />
          )
        }
      />
    )
  }

  return (
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
          title="Cuentas corrientes"
          description="Consultá el historial de cuenta corriente de clientes, colaboradoras y proveedores."
          breadcrumb={trail.length > 0 ? breadcrumbNode : undefined}
          actions={
            status === 'ready'
              ? [
                  {
                    key: 'export',
                    label: 'Exportar',
                    icon: AFFORDANCE.download,
                    variant: 'outlined',
                    iconOnly: true,
                    mobileIconOnly: true,
                    onClick: handleExport,
                  },
                  {
                    key: 'send',
                    label: 'Enviar cuentas corrientes',
                    icon: ICON.sendStatement,
                    variant: 'solid',
                    leadingIcon: true,
                    mobileIconOnly: true,
                    primary: true,
                    onClick: handleSendAll,
                  },
                ]
              : undefined
          }
        />
      </div>
      <div className={cn('flex min-h-0 flex-col', dissolved ? 'absolute inset-0' : 'flex-1')}>
        <PageContent>{body}</PageContent>
      </div>
      {/* Mounted on the region root, OUTSIDE the dissolving content wrapper: that
          wrapper goes `inert` while the master-detail split is open, which would
          swallow the dialog's focus and clicks. */}
      {confirmSend ? (
        <AlertDialog open onOpenChange={(open) => (open ? undefined : setConfirmSend(false))}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Enviar cuentas corrientes</AlertDialogTitle>
              <AlertDialogDescription>
                Vas a enviar el estado de cuenta a {entities.length}{' '}
                {entities.length === 1 ? 'cuenta' : 'cuentas'} del tipo seleccionado. El envío es simulado.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setConfirmSend(false)}>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={confirmSendAll}>Enviar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  )
}

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

export function CuentasCorrientesPage() {
  const { entitiesByType, statementFor, statusFor } = useAccountLedger()
  useRevalidateTeamOnOpen()
  const [searchParams] = useSearchParams()
  const trail = trailToHere(searchParams, '/cuentas-corrientes')
  const breadcrumbNode = <TrailBreadcrumb trail={trail} leaf="Cuentas corrientes" />
  const [entityType, setEntityType] = useState<LedgerEntityType>('client')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<'table' | 'split'>('table')
  const belowDesktop = useIsBelowDesktop()
  const [headerRef, regionRef] = useHeaderOffset<HTMLDivElement, HTMLDivElement>()
  const [confirmSend, setConfirmSend] = useState(false)

  const tabStatus = statusFor(entityType)
  const status: LoadStatus = tabStatus.isLoading ? 'loading' : tabStatus.isError ? 'error' : 'ready'

  useEffect(() => {
    if (status !== 'ready') setMode('table')
  }, [status])

  const entities = useMemo(
    () => (status === 'ready' ? entitiesByType(entityType) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entityType, status],
  )

  const onEntityTypeChange = (next: string) => {
    const nextType = next as LedgerEntityType
    setEntityType(nextType)
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
    setConfirmSend(true)
  }

  function confirmSendAll() {
    toast.success(`Envío simulado de ${entities.length} cuentas corrientes`)
    setConfirmSend(false)
  }

  let body: ReactNode
  if (status !== 'ready') {
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
        table={
          <div className={cn('flex flex-col', dissolved && 'pt-[var(--md-table-offset)]')}>
            {tableInner}
          </div>
        }
        list={
          <>
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

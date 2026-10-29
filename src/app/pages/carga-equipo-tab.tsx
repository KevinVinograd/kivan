import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import type { FilterFn } from '@tanstack/react-table'

import { DataTable, KpiSummaryCard, Toolbar, type Kpi } from '@/app/components/patterns'
import { buildTrailHref } from '@/app/lib/nav-trail'
import { CARGA_CRUMB } from './reports-trail'
import { ReportsTabsHeader, type ReportTab } from './reports-tabs-header'
import { FiltersPopover } from './reports-filters'
import { ReportsNoResults } from './reports-states'
import {
  capacitySearchText,
  cargaEquipoColumns,
  cargaFilterFields,
} from './carga-equipo-columns'
import { PersonDetail } from './person-detail'
import type { OpenRef } from './reports-open-param'
import { ReportsDetailDrawer } from './reports-detail-drawer'
import { formatHours } from './reports-format'
import type { ReportDataset, TeamCapacityReportItem } from './reports-types'

const globalFilterFn: FilterFn<TeamCapacityReportItem> = (row, _columnId, value) =>
  capacitySearchText(row.original).includes(String(value).toLowerCase())

export function CargaEquipoTab({
  dataset,
  selectedRef,
  onSelect,
  onClose,
  activeTab,
  onTabChange,
}: {
  dataset: ReportDataset
  selectedRef: OpenRef | null
  onSelect: (ref: OpenRef) => void
  onClose: () => void
  activeTab: ReportTab
  onTabChange: (tab: ReportTab) => void
}) {
  const navigate = useNavigate()
  const items = dataset.capacity

  const kpis: Kpi[] = useMemo(() => {
    const totalHours = items.reduce((s, i) => s + i.hoursLogged, 0)
    const avg = items.length ? totalHours / items.length : 0
    const overloaded = items.filter((i) => i.status === 'sobrecargada').length
    const under = items.filter((i) => i.status === 'subutilizada').length
    const avgClients = items.length
      ? items.reduce((s, i) => s + i.clientsActive, 0) / items.length
      : 0
    return [
      { id: 'total', label: 'Horas totales del equipo', value: formatHours(totalHours) },
      { id: 'avg', label: 'Promedio por persona', value: formatHours(avg) },
      {
        id: 'over',
        label: 'Personas sobrecargadas',
        value: String(overloaded),
        tone: overloaded > 0 ? 'danger' : 'default',
      },
      {
        id: 'under',
        label: 'Personas subutilizadas',
        value: String(under),
        tone: under > 0 ? 'warning' : 'default',
      },
      { id: 'avgClients', label: 'Clientes promedio por persona', value: avgClients.toFixed(1) },
    ]
  }, [items])

  const rowActions = useMemo(
    () => ({
      onView: (item: TeamCapacityReportItem) => onSelect({ kind: 'person', id: item.personId }),
      onGoToProfile: (item: TeamCapacityReportItem) =>
        navigate(
          buildTrailHref(
            `/team?open=${encodeURIComponent(item.personId)}`,
            CARGA_CRUMB,
            new URLSearchParams(),
          ),
        ),
      onGoToMonthly: (item: TeamCapacityReportItem) =>
        navigate(
          buildTrailHref(
            `/operacion-mensual?block=equipo&open=${encodeURIComponent(item.personId)}`,
            CARGA_CRUMB,
            new URLSearchParams(),
          ),
        ),
    }),
    [onSelect, navigate],
  )
  const columns = useMemo(() => cargaEquipoColumns(rowActions), [rowActions])
  const filterFields = useMemo(() => cargaFilterFields(items), [items])
  const selected =
    selectedRef?.kind === 'person'
      ? (items.find((item) => item.personId === selectedRef.id) ?? null)
      : null
  const selectedProductivity = useMemo(
    () => (selected ? dataset.productivity.filter((p) => p.personId === selected.personId) : []),
    [selected, dataset.productivity],
  )

  const header = <ReportsTabsHeader activeTab={activeTab} onTabChange={onTabChange} />

  const tableInner = (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="px-4 md:px-6 lg:px-8 desktop:px-10">
        <KpiSummaryCard
          figures={kpis}
          heroId="total"
          collapsible
          storageKey="reports-carga-equipo"
        />
      </div>
      <div className="px-4 md:px-6 lg:px-8 desktop:px-10">
        <DataTable
          columns={columns}
          data={items}
          pageSize={15}
          globalFilterFn={globalFilterFn}
          initialColumnVisibility={{ clientNames: false }}
          getRowId={(item) => item.personId}
          onRowClick={(item) => onSelect({ kind: 'person', id: item.personId })}
          toolbar={(table) => (
            <Toolbar
              search={{
                value: (table.getState().globalFilter as string | undefined) ?? '',
                onChange: (value) => table.setGlobalFilter(value),
                placeholder: 'Buscar por persona o rol',
                label: 'Buscar personas',
              }}
              filters={<FiltersPopover table={table} fields={filterFields} />}
            />
          )}
          emptyState={(table) => (
            <ReportsNoResults
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
    <div className="flex flex-col gap-4 md:gap-6">
      {header}
      {tableInner}
      <ReportsDetailDrawer
        title={selected ? selected.personName : 'Detalle'}
        detail={
          selected ? (
            <PersonDetail
              item={selected}
              cohort={items}
              productivity={selectedProductivity}
              allProductivity={dataset.productivity}
              onClose={onClose}
            />
          ) : null
        }
        onClose={onClose}
      />
    </div>
  )
}

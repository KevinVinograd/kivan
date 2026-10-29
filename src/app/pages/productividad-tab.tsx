import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import type { FilterFn } from '@tanstack/react-table'

import { Card, CardContent } from '@/app/components/components'
import { DataTable, KpiSummaryCard, Toolbar, type Kpi } from '@/app/components/patterns'
import { SectionAccordionCard, SectionHeader } from '@/app/components/templates'
import { buildTrailHref } from '@/app/lib/nav-trail'
import { PRODUCTIVIDAD_CRUMB } from './reports-trail'
import { ReportsTabsHeader, type ReportTab } from './reports-tabs-header'
import { FiltersPopover } from './reports-filters'
import { ReportsNoResults } from './reports-states'
import { CHART_ROW_HEIGHT, HoursBarChart } from './reports-charts'
import { hoursByClient, hoursByPerson, hoursByTask } from './reports-aggregations'
import {
  productividadColumns,
  productividadFilterFields,
  productivitySearchText,
} from './productividad-columns'
import { PersonDetail } from './person-detail'
import type { OpenRef } from './reports-open-param'
import { ReportsDetailDrawer } from './reports-detail-drawer'
import { formatHours } from './reports-format'
import type { ProductivityReportItem, ReportDataset } from './reports-types'

const globalFilterFn: FilterFn<ProductivityReportItem> = (row, _columnId, value) =>
  productivitySearchText(row.original).includes(String(value).toLowerCase())

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col">
      <SectionHeader title={title} inset={false} />
      <Card className="flex-1">
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  )
}

export function ProductividadTab({
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
  const items = dataset.productivity

  const byPerson = useMemo(() => hoursByPerson(items), [items])
  const byClient = useMemo(() => hoursByClient(items), [items])
  const byTask = useMemo(() => hoursByTask(items), [items])
  const total = useMemo(() => items.reduce((sum, i) => sum + i.hours, 0), [items])

  const kpis: Kpi[] = [
    { id: 'total', label: 'Total de horas cargadas', value: formatHours(total) },
    {
      id: 'avgPerson',
      label: 'Promedio de horas por persona',
      value: formatHours(byPerson.length ? total / byPerson.length : 0),
    },
    {
      id: 'avgClient',
      label: 'Promedio de horas por cliente',
      value: formatHours(byClient.length ? total / byClient.length : 0),
    },
    { id: 'tareas', label: 'Tareas registradas', value: String(items.length) },
    { id: 'personas', label: 'Personas activas', value: String(byPerson.length) },
  ]

  const rowActions = useMemo(
    () => ({
      onView: (item: ProductivityReportItem) => onSelect({ kind: 'person', id: item.personId }),
      onGoToClient: () => navigate(buildTrailHref('/clients', PRODUCTIVIDAD_CRUMB, new URLSearchParams())),
      onGoToPerson: () => navigate(buildTrailHref('/team', PRODUCTIVIDAD_CRUMB, new URLSearchParams())),
    }),
    [onSelect, navigate],
  )
  const columns = useMemo(() => productividadColumns(rowActions), [rowActions])
  const filterFields = useMemo(() => productividadFilterFields(items), [items])
  const selected =
    selectedRef?.kind === 'person'
      ? (dataset.capacity.find((person) => person.personId === selectedRef.id) ?? null)
      : null
  const selectedProductivity = useMemo(
    () => (selected ? items.filter((row) => row.personId === selected.personId) : []),
    [selected, items],
  )

  const header = <ReportsTabsHeader activeTab={activeTab} onTabChange={onTabChange} />

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      {header}
      <div className="px-4 md:px-6 lg:px-8 desktop:px-10">
        <KpiSummaryCard figures={kpis} heroId="total" collapsible storageKey="reports-productividad" />
      </div>
      <div className="grid gap-4 md:gap-6 px-4 md:px-6 lg:px-8 desktop:px-10 lg:grid-cols-3">
        <ChartCard title="Horas por persona">
          <HoursBarChart
            data={byPerson}
            ariaLabel="Horas cargadas por persona"
            color="blue"
            tailNoun={{ one: 'persona', many: 'personas' }}
            height={CHART_ROW_HEIGHT}
          />
        </ChartCard>
        <ChartCard title="Horas por cliente">
          <HoursBarChart
            data={byClient}
            ariaLabel="Horas cargadas por cliente"
            color="aqua"
            tailNoun={{ one: 'cliente', many: 'clientes' }}
            height={CHART_ROW_HEIGHT}
          />
        </ChartCard>
        <ChartCard title="Horas por tipo de tarea">
          <HoursBarChart
            data={byTask}
            ariaLabel="Horas cargadas por tipo de tarea"
            color="purple"
            tailNoun={{ one: 'tipo', many: 'tipos' }}
            height={CHART_ROW_HEIGHT}
          />
        </ChartCard>
      </div>
      <div className="px-4 md:px-6 lg:px-8 desktop:px-10">
        <SectionAccordionCard
          title="Detalle de cargas"
          summary={
            <span className="type-caption fg-subtle tabular-nums">
              {items.length} {items.length === 1 ? 'tarea' : 'tareas'}
            </span>
          }
          contentInset={false}
        >
          <DataTable
            columns={columns}
            data={items}
            pageSize={15}
            globalFilterFn={globalFilterFn}
            getRowId={(item) => item.id}
            onRowClick={(item) => onSelect({ kind: 'person', id: item.personId })}
            toolbar={(table) => (
              <Toolbar
                search={{
                  value: (table.getState().globalFilter as string | undefined) ?? '',
                  onChange: (value) => table.setGlobalFilter(value),
                  placeholder: 'Buscar por persona, cliente o tarea',
                  label: 'Buscar cargas',
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
        </SectionAccordionCard>
      </div>
      <ReportsDetailDrawer
        title={selected ? selected.personName : 'Detalle'}
        detail={
          selected ? (
            <PersonDetail
              item={selected}
              cohort={dataset.capacity}
              productivity={selectedProductivity}
              allProductivity={items}
              onClose={onClose}
            />
          ) : null
        }
        onClose={onClose}
      />
    </div>
  )
}

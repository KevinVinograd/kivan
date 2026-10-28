import { useMemo } from 'react'
import { useNavigate } from 'react-router'
import type { FilterFn } from '@tanstack/react-table'

import { Card, CardContent } from '@/app/components/components'
import { DataTable, Toolbar } from '@/app/components/patterns'
import { SectionHeader } from '@/app/components/templates'
import { buildTrailHref } from '@/app/lib/nav-trail'
import { RENTABILIDAD_CRUMB } from './reports-trail'
import { ReportsTabsHeader, type ReportTab } from './reports-tabs-header'
import { ReportKpiGroupGrid, type ReportKpiGroup } from './reports-kpis'
import { FiltersPopover } from './reports-filters'
import { ReportsNoResults } from './reports-states'
import { TrendLineChart } from './reports-charts'
import {
  profitabilitySearchText,
  rentabilidadColumns,
  rentabilidadFilterFields,
} from './rentabilidad-columns'
import { ClientDetail } from './client-detail'
import { ReportsDetailDrawer } from './reports-detail-drawer'
import type { OpenRef } from './reports-open-param'
import { formatCompactCurrency, formatPercent } from './reports-format'
import type { ClientProfitabilityReportItem, MarginHistoryPoint, ReportDataset } from './reports-types'

const globalFilterFn: FilterFn<ClientProfitabilityReportItem> = (row, _columnId, value) =>
  profitabilitySearchText(row.original).includes(String(value).toLowerCase())

/** Rentabilidad tab (§3): client profitability + margin, with the margin evolution
 *  chart and the client report in the read-only detail drawer. The KPIs, chart and
 *  table stay on screen behind it — the record is read against them. Read-only. */
export function RentabilidadTab({
  dataset,
  marginHistory,
  selectedRef,
  onSelect,
  onClose,
  activeTab,
  onTabChange,
}: {
  dataset: ReportDataset
  marginHistory: MarginHistoryPoint[]
  selectedRef: OpenRef | null
  onSelect: (ref: OpenRef) => void
  onClose: () => void
  activeTab: ReportTab
  onTabChange: (tab: ReportTab) => void
}) {
  const navigate = useNavigate()
  const items = dataset.profitability

  // Three grouped cards: each pairs a primary value with its related secondary.
  const kpiGroups: ReportKpiGroup[] = useMemo(() => {
    const ingresos = items.reduce((s, i) => s + i.ingresos, 0)
    const costos = items.reduce((s, i) => s + i.costos, 0)
    const rentabilidad = items.reduce((s, i) => s + i.rentabilidad, 0)
    const margenProm = items.length ? items.reduce((s, i) => s + i.margen, 0) / items.length : 0
    const margenBajo = items.filter((i) => i.status === 'margen_bajo' || i.margen < 22).length
    const sinAumento = items.filter((i) => (i.monthsSinceIncrease ?? 0) >= 6).length
    return [
      {
        id: 'ingresos',
        label: 'Ingresos por clientes',
        value: formatCompactCurrency(ingresos),
        secondaries: [{ label: 'Costos asociados', value: formatCompactCurrency(costos) }],
      },
      {
        id: 'rentabilidad',
        label: 'Rentabilidad total',
        value: formatCompactCurrency(rentabilidad),
        tone: rentabilidad >= 0 ? 'success' : 'danger',
        secondaries: [{ label: 'Margen promedio', value: formatPercent(margenProm) }],
      },
      {
        id: 'riesgo',
        label: 'Clientes con margen bajo',
        value: String(margenBajo),
        tone: margenBajo > 0 ? 'warning' : 'default',
        secondaries: [
          {
            label: 'Sin aumento reciente',
            value: String(sinAumento),
            tone: sinAumento > 0 ? 'warning' : 'default',
          },
        ],
      },
    ]
  }, [items])

  const rowActions = useMemo(
    () => ({
      onView: (item: ClientProfitabilityReportItem) => onSelect({ kind: 'client', id: item.clientId }),
      onGoToClient: (item: ClientProfitabilityReportItem) =>
        navigate(
          buildTrailHref(
            `/clients?open=${encodeURIComponent(item.clientId)}`,
            RENTABILIDAD_CRUMB,
            new URLSearchParams(),
          ),
        ),
      onGoToMonthly: (item: ClientProfitabilityReportItem) =>
        navigate(
          buildTrailHref(
            `/operacion-mensual?block=clientes&open=${encodeURIComponent(item.clientId)}`,
            RENTABILIDAD_CRUMB,
            new URLSearchParams(),
          ),
        ),
      // /cobros has no ?open= deep-link — the subject cannot be carried here.
      onGoToFinance: () => navigate(buildTrailHref('/cobros', RENTABILIDAD_CRUMB, new URLSearchParams())),
    }),
    [onSelect, navigate],
  )
  const columns = useMemo(() => rentabilidadColumns(rowActions), [rowActions])
  const filterFields = useMemo(() => rentabilidadFilterFields(items), [items])
  const selected =
    selectedRef?.kind === 'client'
      ? (items.find((item) => item.clientId === selectedRef.id) ?? null)
      : null

  const header = <ReportsTabsHeader activeTab={activeTab} onTabChange={onTabChange} />

  const tableInner = (
    <div className="flex flex-col gap-4 md:gap-6">
      {/* §6 Rentabilidad focal → Rentabilidad total; the 3 grouped cards keep uniform
          primary sizes, so its primacy reads through the green tint, not a size hero. */}
      <ReportKpiGroupGrid groups={kpiGroups} />
      {/* Margin is billed minus PESO area costs, so a non-peso cobro would produce a
          margin in no currency. Those clients are dropped rather than distorted — and a
          dropped client is not a zero row, it is no row, which nothing else on this tab
          would reveal. */}
      {dataset.otherLaneClientCount > 0 ? (
        <p className="type-caption fg-subtle px-4 md:px-6 lg:px-8 desktop:px-10">
          {dataset.otherLaneClientCount === 1
            ? 'Hay 1 cliente facturado en otra moneda, que no aparece en esta tabla ni en los totales.'
            : `Hay ${dataset.otherLaneClientCount} clientes facturados en otra moneda, que no aparecen en esta tabla ni en los totales.`}
        </p>
      ) : null}
      {/* A client with people or productions but no peso cobro in the month has no row:
          there is no billing to state a margin against. Its cost is real all the same,
          and leaving it unsaid is what read as "en algunos clientes el costo no se carga". */}
      {dataset.unbilledCost.clientCount > 0 ? (
        <p className="type-caption fg-subtle px-4 md:px-6 lg:px-8 desktop:px-10">
          {dataset.unbilledCost.clientCount === 1
            ? `1 cliente tuvo ${formatCompactCurrency(dataset.unbilledCost.cost)} de costos en el mes y no tiene cobro en pesos: no aparece en esta tabla ni en los totales.`
            : `${dataset.unbilledCost.clientCount} clientes tuvieron ${formatCompactCurrency(dataset.unbilledCost.cost)} de costos en el mes y no tienen cobro en pesos: no aparecen en esta tabla ni en los totales.`}
        </p>
      ) : null}
      <div className="px-4 md:px-6 lg:px-8 desktop:px-10">
        <div className="flex flex-col">
          <SectionHeader title="Evolución del margen" inset={false} />
          <Card>
            <CardContent>
              <TrendLineChart
                data={marginHistory.map((point) => ({ label: point.label, value: point.margin }))}
                ariaLabel="Evolución del margen promedio por período"
                formatValue={(value) => formatPercent(value)}
              />
            </CardContent>
          </Card>
        </div>
      </div>
      <div className="px-4 md:px-6 lg:px-8 desktop:px-10">
        <DataTable
          columns={columns}
          data={items}
          pageSize={15}
          globalFilterFn={globalFilterFn}
          initialColumnVisibility={{ clientType: false, paymentState: false, team: false }}
          getRowId={(item) => item.clientId}
          onRowClick={(item) => onSelect({ kind: 'client', id: item.clientId })}
          toolbar={(table) => (
            <Toolbar
              search={{
                value: (table.getState().globalFilter as string | undefined) ?? '',
                onChange: (value) => table.setGlobalFilter(value),
                placeholder: 'Buscar por cliente o servicio',
                label: 'Buscar clientes',
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
        title={selected ? selected.clientName : 'Detalle'}
        detail={selected ? <ClientDetail item={selected} cohort={items} onClose={onClose} /> : null}
        onClose={onClose}
      />
    </div>
  )
}

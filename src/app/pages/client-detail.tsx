import { useNavigate } from 'react-router'

import { Badge, Button, Card, CardContent } from '@/app/components/components'
import { buildTrailHref } from '@/app/lib/nav-trail'
import { hasCapability } from '@hold/shared'
import { useRole } from '@/app/lib/use-role'
import { RENTABILIDAD_CRUMB } from './reports-trail'
import {
  ReportComparisonSection,
  ReportDetailRow,
  ReportDetailSection,
  ReportDetailShell,
  ReportFiguresCard,
} from './reports-detail-ui'
import { COHORT_WINDOW, TrendLineChart } from './reports-charts'
import { cohortRanking, median } from './reports-aggregations'
import { useReportsMarginHistory } from './reports-api-data'
import {
  formatCurrency,
  formatHours,
  formatPercent,
  formatRelativeDate,
  profitabilityStatusBadge,
} from './reports-format'
import type { ClientProfitabilityReportItem } from './reports-types'

/**
 * The client's alerts. The margin and team-cost alerts are restatements of the
 * manager-only P&L, so they are only raised when money is visible: "Margen por
 * debajo del objetivo" leaks the same fact the Margen figure does, in words. The
 * price-erosion and payment alerts are operational and stay for every role.
 */
function buildAlerts(item: ClientProfitabilityReportItem, showMoney: boolean): string[] {
  const alerts: string[] = []
  if ((item.monthsSinceIncrease ?? 0) >= 6) alerts.push('Más de 6 meses sin aumento de precio')
  if (showMoney && item.margen < 22) alerts.push('Margen por debajo del objetivo')
  if (item.paymentPending) alerts.push('Pago pendiente o vencido')
  if (showMoney && item.ingresos > 0 && item.teamCost > item.ingresos * 0.7)
    alerts.push('Costo de equipo elevado respecto al ingreso')
  return alerts
}

/** Whole percentage points, for the "X pp sobre la mediana" caption. */
function formatPoints(value: number): string {
  const rounded = Math.round(value)
  const sign = rounded > 0 ? '+' : ''
  return `${sign}${rounded} pp`
}

/**
 * Cliente detail (§3) — the read-only client report shared by Rentabilidad and
 * Resumen: economic summary, the margin comparison against the portfolio, direct
 * costs, uncharged extras, price erosion, margin history and alerts, plus
 * navigation CTAs. Reports never edit; this panel only reads and links out.
 *
 * Money needs the `profitability` capability. Rentabilidad opens only for a role that
 * holds it, but Resumen is
 * admin-visible (`role-access.ts`: `/reports` → owner + admin) and its risk table
 * opens this same drawer — from the table cell, from the phone list and from a
 * `?open=client:<id>` deep link. The gate therefore lives HERE, at render, so every
 * one of those paths is covered: an admin reads the operational subset (horas,
 * erosión de precio, últimos aumentos, equipo, alertas no financieras) and never the
 * studio P&L. Mirrors `PersonDetail`'s `showMoney`.
 */
export function ClientDetail({
  item,
  cohort,
  onClose,
}: {
  item: ClientProfitabilityReportItem | null
  /** Every client in this período — the cohort. */
  cohort: ClientProfitabilityReportItem[]
  onClose: () => void
}) {
  const navigate = useNavigate()
  const { capabilities } = useRole()
  // Hooks run unconditionally (rules-of-hooks): the query is `enabled`-gated on there
  // being an open client + the money capability, so a closed drawer fires nothing.
  const showMoneyForQuery = hasCapability(capabilities, 'profitability')
  const historyQuery = useReportsMarginHistory(
    item != null && showMoneyForQuery,
    item?.clientId ?? undefined,
  )
  if (!item) return null
  const showMoney = showMoneyForQuery
  const badge = profitabilityStatusBadge(item.status)
  // On a failed load the trend renders empty rather than as a flat zero line — a
  // fabricated $0 month is worse than an absent chart (SE001).
  const history = historyQuery.isError ? [] : historyQuery.data
  const alerts = buildAlerts(item, showMoney)

  // The cohort is EVERY client, on MARGIN % — a normalized axis. Absolute profit scales
  // with the size of the client, so an $8M account and a $300k one are not comparable on
  // it; the share of revenue they keep is.
  const ranking = cohortRanking(
    cohort.map((client) => ({
      id: client.clientId,
      label: client.clientName,
      value: client.margen,
    })),
    item.clientId,
    COHORT_WINDOW,
  )
  // A second read, as a caption rather than a second ReferenceLine: two lines on one
  // small chart read as noise, and the service median is a check, not a co-equal
  // benchmark. Its own client is included — a median of one is that client, which is
  // honest (there is no peer group) and is labelled by the count.
  const serviceCohort = cohort.filter((client) => client.service === item.service)
  const serviceMedian = median(serviceCohort.map((client) => client.margen))
  const increaseMedian = median(
    cohort
      .map((client) => client.monthsSinceIncrease)
      .filter((months): months is number => months !== null),
  )
  const unchargedShare = item.ingresos > 0 ? (item.unchargedExtras / item.ingresos) * 100 : 0

  return (
    <ReportDetailShell
      title={item.clientName}
      subtitle={item.clientType ? `${item.clientType} · ${item.service}` : item.service}
      // The status badge is the profitability tier — a capability-gated read, exactly as the
      // Resumen hover preview this drawer replaced gated it.
      badges={showMoney ? <Badge variant={badge.variant}>{badge.label}</Badge> : undefined}
      onClose={onClose}
    >
      <ReportFiguresCard
        figures={
          showMoney
            ? [
                // Rentabilidad is the panel's focal figure (hero) and carries the one
                // profit/loss tint; Margen steps to the supporting tier, fg-default
                // (figure-color-restraint: one tinted figure per viewport).
                {
                  label: 'Rentabilidad',
                  value: formatCurrency(item.rentabilidad),
                  tone: item.rentabilidad >= 0 ? 'success' : 'danger',
                  emphasis: 'hero',
                },
                { label: 'Margen', value: formatPercent(item.margen) },
              ]
            : [
                // Without the P&L, the client's load is the panel's focal figure. No
                // figure is tinted here: neither of these encodes a status.
                { label: 'Horas cargadas', value: formatHours(item.horas), emphasis: 'hero' },
                { label: 'Último aumento', value: formatRelativeDate(item.lastIncreaseDate) },
              ]
        }
      />

      {showMoney ? (
        <ReportComparisonSection
          title="Comparativa · Margen"
          ranking={ranking}
          ariaLabel={`Margen de ${item.clientName} comparado con la cartera`}
          formatValue={(value) => formatPercent(value)}
          caption={
            ranking ? `${formatPoints(ranking.deltaVsMedian)} respecto de la mediana de la cartera` : ''
          }
          footnote={
            serviceCohort.length > 1
              ? `${item.service} · mediana ${formatPercent(serviceMedian)} (${serviceCohort.length} clientes)`
              : `${item.service} · sin otros clientes del servicio`
          }
          emptyLabel="Sin otros clientes para comparar en este período"
        />
      ) : null}

      {showMoney ? (
        <ReportDetailSection title="Resumen económico">
          <ReportDetailRow label="Ingresos del período" value={formatCurrency(item.ingresos)} />
          <ReportDetailRow label="Costos asociados" value={formatCurrency(item.costos)} />
          <ReportDetailRow label="Rentabilidad" value={formatCurrency(item.rentabilidad)} />
          <ReportDetailRow label="Margen" value={formatPercent(item.margen)} />
          <ReportDetailRow label="Horas cargadas" value={formatHours(item.horas)} />
        </ReportDetailSection>
      ) : null}

      {showMoney ? (
        <ReportDetailSection title="Costos directos">
          <ReportDetailRow label="Equipo" value={formatCurrency(item.teamCost)} />
          <ReportDetailRow label="Producciones" value={formatCurrency(item.productionCost)} />
          <ReportDetailRow label="Viáticos" value={formatCurrency(item.travelCost)} />
          <ReportDetailRow label="Extras sin facturar" value={formatCurrency(item.unchargedExtras)} />
        </ReportDetailSection>
      ) : null}

      {showMoney ? (
        <ReportDetailSection title="Extras no cobrados">
          <ReportDetailRow label="Monto sin facturar" value={formatCurrency(item.unchargedExtras)} />
          <ReportDetailRow
            label="Sobre el ingreso del período"
            value={item.ingresos > 0 ? formatPercent(unchargedShare) : 'Sin ingreso registrado'}
          />
        </ReportDetailSection>
      ) : null}

      <ReportDetailSection title="Erosión de precio">
        <ReportDetailRow
          label="Meses sin aumento"
          value={item.monthsSinceIncrease === null ? 'Sin registro' : String(item.monthsSinceIncrease)}
        />
        <ReportDetailRow
          label="Mediana de la cartera"
          value={increaseMedian > 0 ? `${Math.round(increaseMedian)} meses` : 'Sin dato'}
        />
      </ReportDetailSection>

      {showMoney ? (
        <section className="flex flex-col gap-2">
          <h3 className="type-caption fg-subtle">Historial de margen</h3>
          <Card>
            <CardContent>
              <TrendLineChart
                data={history.map((point) => ({ label: point.label, value: point.margin }))}
                ariaLabel={`Evolución del margen de ${item.clientName}`}
                formatValue={(value) => formatPercent(value)}
              />
            </CardContent>
          </Card>
        </section>
      ) : null}

      <ReportDetailSection title="Últimos aumentos">
        <ReportDetailRow label="Último aumento" value={formatRelativeDate(item.lastIncreaseDate)} />
        <ReportDetailRow
          label="Meses sin ajuste"
          value={item.monthsSinceIncrease === null ? 'Sin registro' : String(item.monthsSinceIncrease)}
        />
      </ReportDetailSection>

      <ReportDetailSection title="Equipo asignado">
        {item.team.length > 0 ? (
          item.team.map((name) => <ReportDetailRow key={name} label={name} value="" />)
        ) : (
          <span className="type-body-2 fg-subtle">Sin equipo asignado</span>
        )}
      </ReportDetailSection>

      <section className="flex flex-col gap-2">
        <h3 className="type-caption fg-subtle">Alertas</h3>
        <Card>
          <CardContent className="flex flex-col gap-2">
            {alerts.length > 0 ? (
              alerts.map((alert) => (
                <div key={alert} className="flex items-center gap-2">
                  <Badge variant="warning">Atención</Badge>
                  <span className="type-body-2 fg-default">{alert}</span>
                </div>
              ))
            ) : (
              <span className="type-body-2 fg-subtle">Sin alertas para este período</span>
            )}
          </CardContent>
        </Card>
      </section>

      <div className="flex flex-wrap gap-2">
        <Button
          variant="outlined"
          color="primary"
          onClick={() =>
            navigate(
              buildTrailHref(
                `/clients?open=${item.clientId}`,
                RENTABILIDAD_CRUMB,
                new URLSearchParams(),
              ),
            )
          }
        >
          Ver cliente
        </Button>
        <Button
          variant="outlined"
          color="primary"
          onClick={() =>
            navigate(
              buildTrailHref(
                `/operacion-mensual?block=clientes&open=${item.clientId}`,
                RENTABILIDAD_CRUMB,
                new URLSearchParams(),
              ),
            )
          }
        >
          Ver operación mensual
        </Button>
        <Button
          variant="outlined"
          color="primary"
          onClick={() => navigate(buildTrailHref('/cobros', RENTABILIDAD_CRUMB, new URLSearchParams()))}
        >
          Ver cobros
        </Button>
      </div>
    </ReportDetailShell>
  )
}

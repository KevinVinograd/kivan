import { forwardRef } from 'react'

import { cn } from '@/app/lib/utils'
import { Badge, Card, CardContent, Checkbox, Progress } from '@/app/components/components'
import type { MonthlyAlert } from './monthly-operation-mock-data'
import {
  ALERT_TYPE_LABEL,
  MONOTRIBUTO_FULL_LABEL,
  alertSeverityBadge,
  formatCompactCurrency,
  formatPercent,
  formatSignedPercent,
  monotributoTone,
  monotributoUsagePct,
  pctDelta,
  summarize,
} from './monthly-operation-format'
import { KpiSummaryCard, type Kpi } from '@/app/components/patterns'
import { useMonthlyOperation } from './monthly-operation-data'
import { hasCapability } from '@hold/shared'
import { useRole } from '@/app/lib/use-role'

const TONE_FG = {
  default: 'fg-default',
  success: 'fg-success',
  warning: 'fg-warning',
  danger: 'fg-danger',
} as const

const SEVERITY_RANK: Record<MonthlyAlert['severity'], number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
}

function deltaLabel(current: number, previous: number | undefined): string {
  if (previous === undefined) return 'sin mes anterior'
  const delta = pctDelta(current, previous)
  return delta === null ? 'sin base anterior' : `${formatSignedPercent(delta)} vs mes anterior`
}

function MonthKpiCard() {
  const op = useMonthlyOperation()
  const { capabilities } = useRole()
  const data = op.data
  const summary = op.summary
  const showProfitability = hasCapability(capabilities, 'profitability')

  const collectedPct = summary.totalToCollect > 0 ? (summary.collected / summary.totalToCollect) * 100 : 0
  const paidPct = summary.totalToPayTeam > 0 ? (summary.paidToTeam / summary.totalToPayTeam) * 100 : 0
  const teamRemaining = summary.totalToPayTeam - summary.paidToTeam
  const productionsPending = data.productions.filter((production) => production.status === 'pending').length

  const monthIndex = op.months.findIndex((record) => record.id === op.selectedMonthId)
  const prevSummary =
    monthIndex >= 0 && monthIndex + 1 < op.months.length
      ? summarize(op.months[monthIndex + 1].data)
      : undefined

  const productionsToBill = op.data.clients.reduce((sum, client) => sum + client.productionsAmount, 0)
  const hero: Kpi = {
    id: 'pendingToCollect',
    label: 'Pendiente de cobro',
    value: formatCompactCurrency(summary.pendingToCollect),
    hint: `A cobrar ${formatCompactCurrency(summary.totalToCollect)}${
      productionsToBill > 0 ? `, incluye ${formatCompactCurrency(productionsToBill)} de producciones` : ''
    } · Cobrado ${formatCompactCurrency(summary.collected)} (${formatPercent(collectedPct)})`,
  }

  const rest: Kpi[] = [
    {
      id: 'teamRemaining',
      label: 'Pendiente de pago al equipo',
      value: formatCompactCurrency(teamRemaining),
      hint: `A pagar ${formatCompactCurrency(summary.totalToPayTeam)} · Pagado ${formatCompactCurrency(summary.paidToTeam)} (${formatPercent(paidPct)})`,
    },
    {
      id: 'alerts',
      label: 'Alertas abiertas',
      value: String(summary.openAlerts),
      hint:
        summary.criticalAlerts > 0
          ? `${summary.criticalAlerts} crítica${summary.criticalAlerts > 1 ? 's' : ''}`
          : 'Sin críticas',
    },
    {
      id: 'productions',
      label: 'Producciones',
      value: String(data.productions.length),
      hint: `${productionsPending} sin aprobar`,
    },
    {
      id: 'fixedExpenses',
      label: 'Gastos fijos',
      value: formatCompactCurrency(summary.fixedExpenses),
      hint: deltaLabel(summary.fixedExpenses, prevSummary?.fixedExpenses),
    },
  ]

  if (showProfitability) {
    const hasCostBasis = summary.estimatedProfitability !== summary.totalToCollect
    rest.push(
      hasCostBasis
        ? {
            id: 'profitability',
            label: 'Rentabilidad estimada',
            value: formatCompactCurrency(summary.estimatedProfitability),
            hint: deltaLabel(summary.estimatedProfitability, prevSummary?.estimatedProfitability),
            tone: summary.estimatedProfitability >= 0 ? 'success' : 'danger',
          }
        : {
            id: 'profitability',
            label: 'Rentabilidad estimada',
            value: 'Sin costos cargados',
            hint: 'Facturado sin gastos ni pagos del mes',
          },
    )
  }

  return <KpiSummaryCard figures={[hero, ...rest]} heroId="pendingToCollect" dividedHero />
}

const AlertsCard = forwardRef<HTMLDivElement>(function AlertsCard(_props, ref) {
  const op = useMonthlyOperation()
  const summary = op.summary
  const alerts = [...op.data.alerts].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])

  async function toggleResolved(alert: MonthlyAlert, resolved: boolean) {
    await op.setAlertStatus(alert.id, resolved ? 'resolved' : 'open')
  }

  return (
    <Card ref={ref} className="lg:col-span-2">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <span className="type-caption fg-subtle">Alertas prioritarias</span>
          <Badge variant={summary.criticalAlerts > 0 ? 'danger' : summary.openAlerts > 0 ? 'warning' : 'success'}>
            {summary.openAlerts} abiertas
          </Badge>
        </div>
        {alerts.length === 0 ? (
          <span className="type-body-2 fg-subtle">No hay alertas este mes</span>
        ) : (
          <div className="flex flex-col">
            {alerts.map((alert) => {
              const severity = alertSeverityBadge(alert.severity)
              const resolved = alert.status === 'resolved'
              return (
                <div
                  key={alert.id}
                  className="flex items-center gap-3 border-b border-alpha-subtle py-3 last:border-b-0 last:pb-0"
                >
                  <Checkbox
                    checked={resolved}
                    disabled={op.locked}
                    onCheckedChange={(checked) => toggleResolved(alert, checked === true)}
                    aria-label={`Marcar resuelta: ${ALERT_TYPE_LABEL[alert.type]} ${alert.entity}`}
                    className="shrink-0"
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Badge variant={severity.variant}>{severity.label}</Badge>
                    <span className={cn('type-button', resolved ? 'fg-disabled line-through' : 'fg-default')}>
                      {ALERT_TYPE_LABEL[alert.type]}: {alert.entity}
                    </span>
                    <span className={cn('type-caption', resolved ? 'fg-disabled line-through' : 'fg-subtle')}>
                      {alert.description}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
})

function MonotributoCard() {
  const op = useMonthlyOperation()
  const monotributos = op.data.monotributo

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <span className="type-caption fg-subtle">Monotributo</span>
        {monotributos.length === 0 ? (
          <span className="type-body-2 fg-subtle">Sin monotributos cargados.</span>
        ) : (
          <div className="flex flex-col gap-4">
            {monotributos.map((watch) => {
              const pct = monotributoUsagePct(watch)
              const tone = monotributoTone(pct)
              return (
                <div key={watch.category} className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="type-button fg-default">{MONOTRIBUTO_FULL_LABEL[watch.category]}</span>
                    <span className={cn('type-caption tabular-nums', TONE_FG[tone])}>{formatPercent(pct)}</span>
                  </div>
                  <Progress
                    value={pct}
                    tone={tone}
                    aria-label={`Uso de ${MONOTRIBUTO_FULL_LABEL[watch.category]}`}
                  />
                  <span className="type-caption fg-subtle tabular-nums">
                    {formatCompactCurrency(watch.annualBilled)} de {formatCompactCurrency(watch.annualLimit)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export function MonthSummarySection({ alertsRef }: { alertsRef: React.Ref<HTMLDivElement> }) {
  return (
    <>
      <MonthKpiCard />
      <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-3">
        <AlertsCard ref={alertsRef} />
        <MonotributoCard />
      </div>
    </>
  )
}

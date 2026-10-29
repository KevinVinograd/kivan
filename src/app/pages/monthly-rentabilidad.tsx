import { cn } from '@/app/lib/utils'
import { Card, CardContent } from '@/app/components/components'
import {
  clientMargin,
  clientMarginPercent,
  formatCurrency,
  formatPercent,
  marginTone,
  summarize,
} from './monthly-operation-format'
import { useMonthlyOperation } from './monthly-operation-data'
import { CompositionDonut, CompositionLegend } from './monthly-rentabilidad-charts'

const TONE_FG = {
  default: 'fg-default',
  success: 'fg-success',
  warning: 'fg-warning',
  danger: 'fg-danger',
} as const
type Tone = keyof typeof TONE_FG

const RANK_FG: Record<'default' | 'warning' | 'danger', string> = {
  default: 'fg-default',
  warning: 'fg-warning',
  danger: 'fg-danger',
}

function WaterfallRow({
  label,
  value,
  tone = 'default',
  strong = false,
}: {
  label: string
  value: string
  tone?: Tone
  strong?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-alpha-subtle py-2 last:border-b-0">
      <span className={cn('type-body-2', strong ? 'fg-default font-semibold' : 'fg-subtle')}>{label}</span>
      <span className={cn('type-body tabular-nums', strong && 'font-semibold', TONE_FG[tone])}>{value}</span>
    </div>
  )
}

export function RentabilidadView() {
  const op = useMonthlyOperation()
  const summary = summarize(op.data)
  const teamCost = summary.totalToPayTeam
  const productionCost = op.data.clients.reduce((sum, client) => sum + client.productionCost, 0)
  const margin =
    summary.totalToCollect > 0 ? (summary.estimatedProfitability / summary.totalToCollect) * 100 : 0
  const profitTone: Tone = summary.estimatedProfitability >= 0 ? 'success' : 'danger'
  const donutTone = marginTone(margin)

  const rankedClients = op.data.clients
    .map((client) => {
      const percent = clientMarginPercent(client)
      const margin = clientMargin(client)
      if (percent === null || margin === null) return null
      return { name: client.name, margin, percent, tone: marginTone(percent) }
    })
    .filter((client) => client !== null)
    .sort((a, b) => b.margin - a.margin)
    .slice(0, 5)

  return (
    <div className="flex flex-col gap-4 md:gap-6 px-4 md:px-6 lg:px-8 desktop:px-10">
      <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-2">
        <Card variant="outlined">
          <CardContent className="flex flex-col gap-2">
            <span className="type-caption fg-subtle">Composición de la rentabilidad</span>
            <div className="flex flex-col">
              <WaterfallRow label="Ingresos totales" value={formatCurrency(summary.totalToCollect)} />
              <WaterfallRow label="Costo de equipo" value={`-${formatCurrency(teamCost)}`} />
              <WaterfallRow label="Producciones y viáticos" value={`-${formatCurrency(productionCost)}`} />
              <WaterfallRow label="Gastos fijos" value={`-${formatCurrency(summary.fixedExpenses)}`} />
              <WaterfallRow
                label="Rentabilidad estimada"
                value={formatCurrency(summary.estimatedProfitability)}
                tone={profitTone}
                strong
              />
            </div>
          </CardContent>
        </Card>

        <Card variant="outlined">
          <CardContent className="flex flex-col gap-3">
            <span className="type-caption fg-subtle">Margen y composición</span>
            <CompositionDonut
              teamCost={teamCost}
              productionCost={productionCost}
              fixedExpenses={summary.fixedExpenses}
              profit={summary.estimatedProfitability}
              margin={margin}
              marginTone={donutTone}
            />
            <CompositionLegend showProfit={summary.estimatedProfitability > 0} />
            <span className="type-body-2 fg-subtle text-center">
              Sobre ingresos de {formatCurrency(summary.totalToCollect)}
            </span>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-3">
        <span className="type-caption fg-subtle">Clientes por rentabilidad</span>
        {rankedClients.length === 0 ? (
          <span className="type-body-2 fg-subtle">
            {op.data.clients.length === 0
              ? 'No hay clientes en este mes'
              : 'Sin costo de equipo asignado por cliente'}
          </span>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {rankedClients.map((client, index) => (
              <Card key={client.name} variant="outlined">
                <CardContent className="flex items-center gap-3">
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="type-body-2 fg-default truncate">{client.name}</span>
                    <span className={cn('type-body tabular-nums', RANK_FG[client.tone])}>
                      {formatCurrency(client.margin)}
                    </span>
                    <span className="type-caption fg-subtle tabular-nums">{formatPercent(client.percent)}</span>
                  </div>
                  <span className="type-display fg-disabled tabular-nums shrink-0">{index + 1}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

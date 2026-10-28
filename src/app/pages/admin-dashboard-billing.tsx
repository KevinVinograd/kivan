import { useNavigate } from 'react-router'

import { SectionHeader } from '@/app/components/templates'
import { Badge, Card, CardContent, Progress, type ProgressTone } from '@/app/components/components'
import { KpiSummaryCard, type Kpi, type KpiTone } from '@/app/components/patterns'
import { buildTrailHref } from '@/app/lib/nav-trail'
import { DashboardCta, FloatingCardCta } from './dashboard-cta'
import {
  billingItemStatusBadge,
  formatCompactCurrency,
  formatCurrency,
  formatPercent,
  monotributoAlertBadge,
} from './admin-dashboard-format'
import type { BillingAndArca, BillingItemRow, MonotributoAlert, MonotributoRow } from './admin-dashboard-types'

// The dashboard is the trail root, so this section CTA carries a back-trail crumb
// to the dashboard (no inbound trail to forward — `new URLSearchParams()`).
const BILLING_CTA_HREF = buildTrailHref('/billing', { label: 'Dashboard', to: '/dashboard' }, new URLSearchParams())

const MONOTRIBUTO_BAR_TONE: Record<MonotributoAlert, ProgressTone> = {
  normal: 'default',
  atencion: 'warning',
  limite: 'danger',
}

// No usage estimate = the figure slot carries the prose empty state ("No disponible"),
// which the summary card steps down and quiets on its own — leaving it untoned is what
// keeps it `fg-subtle` there, so this returns no tone rather than `default`.
function usageTone(pct: number | null): KpiTone | undefined {
  if (pct == null) return undefined
  if (pct >= 90) return 'danger'
  if (pct >= 80) return 'warning'
  return 'default'
}

function MonotributoCard({ row }: { row: MonotributoRow }) {
  const navigate = useNavigate()
  const alert = monotributoAlertBadge(row.alert)
  return (
    <Card interactive onClick={() => navigate(row.ctaHref)} className="group relative overflow-hidden">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="type-section fg-default">{row.label}</span>
              <Badge variant={alert.variant}>{alert.label}</Badge>
            </div>
            <span className="type-mono-2 tabular-nums fg-default">Facturado: {formatCompactCurrency(row.billed)}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Progress value={row.usagePercent} tone={MONOTRIBUTO_BAR_TONE[row.alert]} className="flex-1" />
          <span className="type-caption tabular-nums fg-subtle">{formatPercent(row.usagePercent)}</span>
        </div>
        <FloatingCardCta href={row.ctaHref}>Revisar</FloatingCardCta>
      </CardContent>
    </Card>
  )
}

function BillingItemCard({ row }: { row: BillingItemRow }) {
  const navigate = useNavigate()
  const status = billingItemStatusBadge(row.status)
  return (
    <Card interactive onClick={() => navigate(row.ctaHref)} className="group relative overflow-hidden">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="type-section fg-default">{row.clientName}</span>
              {row.monotributo ? <Badge variant="outline">{row.monotributo}</Badge> : null}
              <Badge variant={status.variant}>{status.label}</Badge>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          <span className="type-mono-2 tabular-nums fg-default">Monto: {formatCurrency(row.amount)}</span>
        </div>
        <FloatingCardCta href={row.ctaHref}>Ver facturación</FloatingCardCta>
      </CardContent>
    </Card>
  )
}

/**
 * §7 Facturación y ARCA. Helps admin prevent invoicing errors and monotributo
 * limit issues: the invoice + monotributo totals, the per-account annual usage
 * (three monotributos back the agency's invoicing) with a usage bar, and the
 * pending billing items — each rendered as one card (mirroring Clientes en
 * riesgo) with a hover/focus CTA. Status is mock/local — there is no real ARCA
 * integration.
 */
export function BillingAndArcaCard({ billing }: { billing: BillingAndArca }) {
  const figures: Kpi[] = [
    // Hero figure: invoices still to issue — what this section exists to surface.
    { id: 'invoices-pending', label: 'Facturas pendientes', value: String(billing.invoicesPending) },
    // Context behind the pending figure.
    { id: 'invoices-reviewed', label: 'Facturas revisadas', value: String(billing.invoicesReviewed) },
    { id: 'monotributos-active', label: 'Monotributos activos', value: String(billing.monotributosActive) },
    {
      id: 'monotributos-alert',
      label: 'Monotributos en alerta',
      value: String(billing.monotributosAlert),
      tone: billing.monotributosAlert > 0 ? 'warning' : 'default',
    },
    {
      id: 'usage-estimate',
      label: 'Uso estimado del límite',
      value: billing.usageEstimate != null ? formatPercent(billing.usageEstimate) : 'No disponible',
      tone: usageTone(billing.usageEstimate),
    },
  ]

  return (
    <section aria-label="Facturación y ARCA" className="group/facturacion flex flex-col">
      <SectionHeader
        title="Facturación y ARCA"
        actions={
          <span className="[@media(hover:hover)]:opacity-0 motion-standard group-hover/facturacion:opacity-100 focus-within:opacity-100">
            <DashboardCta href={BILLING_CTA_HREF}>
              <span className="sm:hidden">Revisar</span>
              <span className="hidden sm:block">Revisar facturación</span>
            </DashboardCta>
          </span>
        }
      />
      <div className="flex flex-col gap-4 md:gap-6 px-4 md:px-6 lg:px-8 xl:pr-5 desktop:pl-10">
        <KpiSummaryCard figures={figures} heroId="invoices-pending" />
        {billing.monotributos.length > 0 ? (
          <div className="flex flex-col gap-2">
            <span className="type-body-2 font-semibold fg-default">Uso de monotributos</span>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {billing.monotributos.map((row) => (
                <MonotributoCard key={row.id} row={row} />
              ))}
            </div>
          </div>
        ) : null}
        {billing.items.length > 0 ? (
          <div className="flex flex-col gap-2">
            <span className="type-body-2 font-semibold fg-default">Facturación pendiente</span>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {billing.items.map((row) => (
                <BillingItemCard key={row.clientId} row={row} />
              ))}
            </div>
          </div>
        ) : (
          <p className="type-body-2 fg-subtle">No hay facturación pendiente para este mes.</p>
        )}
      </div>
    </section>
  )
}

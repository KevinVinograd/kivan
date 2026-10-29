import { useNavigate } from 'react-router'

import { cn } from '@/app/lib/utils'
import { SectionHeader } from '@/app/components/templates'
import { Badge, Card, CardContent } from '@/app/components/components'
import { KpiSummaryCard, type Kpi } from '@/app/components/patterns'
import { buildTrailHref } from '@/app/lib/nav-trail'
import { DashboardCta, FloatingCardCta } from './dashboard-cta'
import { collectionStatusBadge, formatCompactCurrency, formatCurrency, formatShortDate } from './admin-dashboard-format'
import type { ClientCollections, CollectionRow } from './admin-dashboard-types'

const COLLECTIONS_CTA_HREF = buildTrailHref(
  '/operacion-mensual?block=clientes',
  { label: 'Dashboard', to: '/dashboard' },
  new URLSearchParams(),
)

function dueLabel(row: CollectionRow): string {
  if (row.overdueDays != null) return `Vencido hace ${row.overdueDays} días`
  if (row.dueIso) return `Vence ${formatShortDate(row.dueIso)}`
  return 'Sin fecha'
}

function CollectionCard({ row }: { row: CollectionRow }) {
  const navigate = useNavigate()
  const status = collectionStatusBadge(row.status)
  return (
    <Card interactive onClick={() => navigate(row.ctaHref)} className="group relative overflow-hidden">
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <span className={cn('type-section tabular-nums', row.overdueDays != null ? 'fg-danger' : 'fg-default')}>
            {formatCurrency(row.amount)}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="type-body-2 fg-default">{row.clientName}</span>
            <Badge variant={status.variant}>{status.label}</Badge>
          </div>
          <span className={cn('type-caption', row.overdueDays != null ? 'fg-danger' : 'fg-subtle')}>
            {dueLabel(row)}
          </span>
        </div>
        <FloatingCardCta href={row.ctaHref}>Ver cobro</FloatingCardCta>
      </CardContent>
    </Card>
  )
}

export function ClientCollectionsOperationsCard({ collections }: { collections: ClientCollections }) {
  const figures: Kpi[] = [
    { id: 'total-pending', label: 'Total pendiente', value: formatCompactCurrency(collections.totalPending) },
    { id: 'total-expected', label: 'Total esperado', value: formatCompactCurrency(collections.totalExpected) },
    { id: 'total-collected', label: 'Total cobrado', value: formatCompactCurrency(collections.totalCollected) },
    {
      id: 'overdue',
      label: 'Vencidos',
      value: String(collections.overdue),
      tone: collections.overdue > 0 ? 'danger' : 'default',
    },
    {
      id: 'unregistered',
      label: 'Sin registrar',
      value: String(collections.unregistered),
      tone: collections.unregistered > 0 ? 'warning' : 'default',
    },
  ]

  return (
    <section aria-label="Cobros de clientes" className="group/cobros flex flex-col">
      <SectionHeader
        title="Cobros de clientes"
        actions={
          <span className="[@media(hover:hover)]:opacity-0 motion-standard group-hover/cobros:opacity-100 focus-within:opacity-100">
            <DashboardCta href={COLLECTIONS_CTA_HREF}>Ver cobros</DashboardCta>
          </span>
        }
      />
      <div className="flex flex-col gap-4 md:gap-6 px-4 md:px-6 lg:px-8 xl:pr-5 desktop:pl-10">
        <KpiSummaryCard figures={figures} heroId="total-pending" />
        {collections.rows.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {collections.rows.map((row) => (
              <CollectionCard key={row.clientId} row={row} />
            ))}
          </div>
        ) : (
          <p className="type-body-2 fg-subtle">No hay cobros pendientes para este mes.</p>
        )}
      </div>
    </section>
  )
}

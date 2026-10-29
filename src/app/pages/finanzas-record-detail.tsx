import { useNavigate } from 'react-router'

import { Badge, Button } from '@/app/components/components'
import { buildTrailHref, type Crumb } from '@/app/lib/nav-trail'
import {
  ReportDetailRow,
  ReportDetailSection,
  ReportDetailShell,
  ReportFiguresCard,
} from './reports-detail-ui'
import { bucketTone, formatCurrency, formatShortDate, type KpiTone } from './reports-format'
import { formatMonthYear } from './clients-format'
import type { BadgeVariant } from '@/app/components/components'
import type { ReportDataset } from './reports-types'

const FINANZAS_CRUMB: Crumb = { label: 'Reportes', to: '/reports?tab=finanzas' }

const TONE_BADGE: Record<KpiTone, BadgeVariant> = {
  default: 'neutral',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
}

const OWNER: Record<'receivable' | 'payment', { route: string; label: string }> = {
  receivable: { route: '/cobros', label: 'Cobros' },
  payment: { route: '/pagos', label: 'Pagos' },
}

export function FinanzasRecordDetail({
  kind,
  id,
  dataset,
  onClose,
}: {
  kind: 'receivable' | 'payment'
  id: string
  dataset: ReportDataset
  onClose: () => void
}) {
  const navigate = useNavigate()
  const f = dataset.financials

  const collection = kind === 'receivable' ? f.cobrosDetail.find((row) => row.id === id) : undefined
  const billing = kind === 'receivable' ? f.facturacionDetail.find((row) => row.id === id) : undefined
  const payment = kind === 'payment' ? f.pagosDetail.find((row) => row.id === id) : undefined
  const expense = kind === 'payment' ? f.gastosFijosList.find((line) => line.id === id) : undefined

  const owner = OWNER[kind]
  const seeInOwner = (
    <Button
      variant="outlined"
      color="primary"
      onClick={() =>
        navigate(
          buildTrailHref(
            `${owner.route}?open=${id}&period=${f.period}`,
            FINANZAS_CRUMB,
            new URLSearchParams(),
          ),
        )
      }
    >
      Ver en {owner.label}
    </Button>
  )

  if (collection || billing) {
    const name = collection?.clientName ?? billing?.clientName ?? ''
    const total = collection?.totalAmount ?? billing?.totalAmount ?? 0
    const collected = collection?.collectedAmount ?? 0
    const outstanding = total - collected

    return (
      <ReportDetailShell
        title={name}
        subtitle={
          collection ? `${formatMonthYear(f.period)} · ${collection.service}` : formatMonthYear(f.period)
        }
        badges={
          <>
            {collection ? (
              <Badge variant={TONE_BADGE[bucketTone(collection.status)]}>{collection.statusLabel}</Badge>
            ) : null}
            {billing ? (
              <Badge variant={TONE_BADGE[bucketTone(billing.billingStatus)]}>{billing.billingLabel}</Badge>
            ) : null}
          </>
        }
        onClose={onClose}
      >
        <ReportFiguresCard
          figures={[
            {
              label: 'Saldo',
              value: formatCurrency(outstanding),
              emphasis: 'hero',
              tone: outstanding > 0 ? (collection ? bucketTone(collection.status) : 'warning') : 'success',
            },
            { label: 'Monto total', value: formatCurrency(total) },
          ]}
        />

        <ReportDetailSection title="Detalle">
          {collection ? (
            <>
              <ReportDetailRow label="Servicio" value={collection.service} />
              <ReportDetailRow label="Vence" value={formatShortDate(collection.dueDate)} />
              <ReportDetailRow label="Cobrado" value={formatCurrency(collected)} />
              <ReportDetailRow label="Estado de cobro" value={collection.statusLabel} />
            </>
          ) : null}
          {billing ? <ReportDetailRow label="Estado de factura" value={billing.billingLabel} /> : null}
        </ReportDetailSection>

        <div className="flex flex-wrap gap-2">{seeInOwner}</div>
      </ReportDetailShell>
    )
  }

  if (payment) {
    const outstanding = payment.totalAmount - payment.paidAmount
    return (
      <ReportDetailShell
        title={payment.recipientName}
        subtitle={`${formatMonthYear(f.period)} · ${payment.concept}`}
        badges={<Badge variant={TONE_BADGE[bucketTone(payment.status)]}>{payment.statusLabel}</Badge>}
        onClose={onClose}
      >
        <ReportFiguresCard
          figures={[
            {
              label: 'Saldo',
              value: formatCurrency(outstanding),
              emphasis: 'hero',
              tone: outstanding > 0 ? bucketTone(payment.status) : 'success',
            },
            { label: 'Monto total', value: formatCurrency(payment.totalAmount) },
          ]}
        />

        <ReportDetailSection title="Detalle">
          <ReportDetailRow label="Concepto" value={payment.concept} />
          <ReportDetailRow label="Vence" value={formatShortDate(payment.expectedDate)} />
          <ReportDetailRow label="Pagado" value={formatCurrency(payment.paidAmount)} />
          <ReportDetailRow label="Estado" value={payment.statusLabel} />
        </ReportDetailSection>

        <div className="flex flex-wrap gap-2">{seeInOwner}</div>
      </ReportDetailShell>
    )
  }

  if (expense) {
    return (
      <ReportDetailShell
        title={expense.concept}
        subtitle={formatMonthYear(f.period)}
        badges={
          <Badge variant={expense.paid ? 'success' : 'warning'}>
            {expense.paid ? 'Pagado' : 'Pendiente'}
          </Badge>
        }
        onClose={onClose}
      >
        <ReportFiguresCard
          figures={[
            {
              label: 'Monto',
              value: formatCurrency(expense.amount),
              emphasis: 'hero',
              tone: expense.paid ? 'success' : 'warning',
            },
          ]}
        />

        <ReportDetailSection title="Detalle">
          <ReportDetailRow label="Concepto" value={expense.concept} />
          <ReportDetailRow label="Estado" value={expense.paid ? 'Pagado' : 'Pendiente'} />
        </ReportDetailSection>

        <div className="flex flex-wrap gap-2">{seeInOwner}</div>
      </ReportDetailShell>
    )
  }

  return null
}

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

/**
 * The record drawer behind the four Finanzas detail tables — a receivable (Cobros por
 * estado, Facturación) or a payment (Pagos por estado, Gastos fijos).
 *
 * WHY THIS EXISTS RATHER THAN REUSING `CobrosDetail` / `PagosDetail`
 *
 * Those rows used to deep-link OUT to `/cobros` and `/pagos`, which threw the reader out of
 * the report they were reading. A drill-in exists to be read AGAINST the aggregate it came
 * from — the donut, the table, the period — and navigating away destroys exactly that
 * context (, which names `/reports` as the
 * sanctioned instance of a read-only drill-in on a tabbed analytics surface).
 *
 * But `CobrosDetail` could not simply be hoisted in here. It carries "Generar factura",
 * "Asociar factura" and "Marcar cobrado" — and the convention is explicit
 * that the Finanzas tab is "acceptable as aggregate analytics; do not let it grow
 * operate-style actions". Importing it would have smuggled three money mutations onto an
 * analysis surface. This component cannot: it does not import them, so they cannot arrive
 * by accident. Acting on the record is one click away and clearly labelled — "Ver en
 * Cobros" hands the reader to the page that owns the operation.
 *
 * WHY IT READS THE REPORT ROW, NOT THE RECEIVABLES STORE
 *
 * Every figure here comes from the period's own `dataset`, not from `useReceivables()`.
 * Reportes shows the ANALYTIC view of a period; `/cobros` shows the OPERATIONAL record. If
 * this drawer read the live store it could contradict the very table the reader just
 * clicked — the row would say one balance and its own drawer another. Same source, same
 * numbers, by construction.
 */

const FINANZAS_CRUMB: Crumb = { label: 'Reportes', to: '/reports?tab=finanzas' }

const TONE_BADGE: Record<KpiTone, BadgeVariant> = {
  default: 'neutral',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
}

/** The operate surface that owns each record kind — the drawer's one way out. */
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

  // A receivable can appear in BOTH tables — "Cobros por estado" and "Facturación" are the
  // same record seen through two lenses. When it does, show both statuses: that pairing
  // ("Pendiente" + "Sin factura") is the most useful thing the report knows about it, and
  // it is precisely what the reader came to check.
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

  // ── Receivable ──
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
            // Saldo leads: the reader opened a status table, so what is still OWED is the
            // question. `Monto total` is the frame it is read against, not the answer.
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

  // ── Payment ──
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

  // ── Fixed expense ──
  // A `FixedExpenseLine` is a payment with a thinner shape
  // (`{ id, concept, currency, amount, paid }`): no recipient, no due date, a boolean
  // instead of a status enum. `formatCurrency` below is correct because every row in this
  // report is the peso lane by construction — see `FinancialOperationsReport`. It gets the
  // fields it has
  // rather than empty rows for the ones it does not — a drawer padded with "—" teaches the
  // reader to stop reading it.
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

  // `readOpenRef` already validated the id against this period's dataset, so this is
  // unreachable in practice — but a record that vanished between validation and render must
  // not blank the drawer silently.
  return null
}

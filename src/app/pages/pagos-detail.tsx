import type { ReactNode } from 'react'
import { Link } from 'react-router'

import { Badge, Button, Card, CardContent } from '@/app/components/components'
import { KpiSummaryCard } from '@/app/components/patterns'
import {
  formatMoney,
  formatMonthYear,
  formatShortDate,
  NO_REGISTRO,
} from './cobranza-format'
import {
  ActivityTimeline,
  DetailRow,
  DetailSection,
  ScrollRevealDetail,
} from './cobranza-detail-ui'
import {
  hasPayoutStatement,
  paymentLedgerAccount,
  useBankForPayment,
  useLedgerForPayment,
  usePayoutForPayment,
  type DetailQuery,
} from './pagos-detail-data'
import {
  isPaymentOverdue,
  paymentActivity,
  paymentBalanceOf,
  paymentBankData,
  paymentDesglose,
  paymentLedger,
  paymentStatusBadge,
  RECIPIENT_TYPE_LABEL,
} from './pagos-format'
import type { Payment } from './pagos-mock-data'

function SectionState({ query, label }: { query: DetailQuery<unknown>; label: string }) {
  if (query.isLoading) {
    return <p className="type-body-2 fg-subtle">Cargando {label}…</p>
  }
  return <p className="type-body-2 fg-subtle">No pudimos cargar {label}.</p>
}

export function PagosDetail({
  payment,
  onClose,
  onApprove,
  onMarkPaid,
  periodControl,
}: {
  payment: Payment | null
  onClose: () => void
  onApprove: (payment: Payment) => void
  onMarkPaid: (payment: Payment) => void
  periodControl?: ReactNode
}) {
  const payoutQuery = usePayoutForPayment(payment)
  const ledgerQuery = useLedgerForPayment(payment)
  const bankQuery = useBankForPayment(payment)

  if (!payment) return null
  const p = payment
  const status = paymentStatusBadge(p.status)
  const balance = paymentBalanceOf(p)
  const desglose = paymentDesglose(p, payoutQuery.data)
  const bank = paymentBankData(bankQuery.data)
  const ledger = paymentLedger(ledgerQuery.data)
  const activity = paymentActivity(p)
  const saldoTone = isPaymentOverdue(p) ? 'danger' : balance > 0 ? 'warning' : 'default'

  const isMemberPay = p.recipientType === 'collaborator' || p.recipientType === 'employee'
  const awaitsPayout = hasPayoutStatement(p) && (payoutQuery.isLoading || payoutQuery.isError)
  const payoutMissing = isMemberPay && !awaitsPayout && payoutQuery.data === null
  const hasAccount = paymentLedgerAccount(p) !== null

  return (
    <ScrollRevealDetail
      name={p.recipientName}
      subtitle={`${RECIPIENT_TYPE_LABEL[p.recipientType]} · ${formatMonthYear(p.period)}`}
      badges={<Badge variant={status.variant}>{status.label}</Badge>}
      controls={periodControl}
      onClose={onClose}
    >
      <KpiSummaryCard
        figures={[
          { id: 'monto', label: 'Monto', value: formatMoney(p.totalAmount, p.currency) },
          { id: 'saldo', label: 'Saldo', value: formatMoney(balance, p.currency), tone: saldoTone },
        ]}
        heroId="saldo"
        actions={
          p.status === 'cancelled' ? undefined : (
            <>
              {p.status === 'pending' ? (
                <Button variant="solid" color="primary" size="dense" onClick={() => onApprove(p)}>
                  Aprobar
                </Button>
              ) : null}
              <Button variant="outlined" color="primary" size="dense" onClick={() => onMarkPaid(p)}>
                Marcar pagado
              </Button>
            </>
          )
        }
      />

      <DetailSection title="Resumen">
        <DetailRow label="Destinatario" value={p.recipientName} />
        <DetailRow label="Tipo" value={RECIPIENT_TYPE_LABEL[p.recipientType]} />
        <DetailRow label="Concepto" value={p.concept} />
        <DetailRow label="Monto" value={formatMoney(p.totalAmount, p.currency)} />
        <DetailRow label="Estado" value={<Badge variant={status.variant}>{status.label}</Badge>} />
        <DetailRow label="Fecha prevista" value={formatShortDate(p.expectedDate)} />
        <DetailRow
          label="Fecha de pago"
          value={p.paymentDate ? formatShortDate(p.paymentDate) : NO_REGISTRO}
        />
        <DetailRow
          label="Medio de pago"
          value={p.treasuryAccountName ?? NO_REGISTRO}
        />
      </DetailSection>

      <DetailSection title={isMemberPay ? 'Desglose de la liquidación' : 'Desglose'}>
        {awaitsPayout ? (
          <SectionState query={payoutQuery} label="la liquidación" />
        ) : payoutMissing ? (
          <div className="flex flex-col items-start gap-2">
            <p className="type-body-2 fg-subtle">
              Sin liquidación registrada para {formatMonthYear(p.period)}.
            </p>
            <Link
              to={`/operacion-mensual?period=${p.period}`}
              className="self-start rounded-control type-body-2 fg-subtle outline-none transition-colors hover:fg-default focus-visible:ring-2 focus-visible:ring-focus"
            >
              Cargarla en Operación mensual
            </Link>
          </div>
        ) : (
          desglose.map((row) => <DetailRow key={row.label} label={row.label} value={row.value} />)
        )}
      </DetailSection>

      {hasAccount ? (
        <DetailSection title="Datos de pago">
          {bankQuery.isLoading || bankQuery.isError ? (
            <SectionState query={bankQuery} label="los datos bancarios" />
          ) : (
            bank.map((row) => <DetailRow key={row.label} label={row.label} value={row.value} />)
          )}
        </DetailSection>
      ) : null}

      {hasAccount ? (
        <DetailSection title="Cuenta corriente">
          {ledgerQuery.isLoading || ledgerQuery.isError || ledger === null ? (
            <SectionState query={ledgerQuery} label="la cuenta corriente" />
          ) : (
            <>
              <DetailRow
                label="Saldo anterior"
                value={formatMoney(ledger.previousBalance, p.currency)}
              />
              <DetailRow
                label="Cargos del período"
                value={formatMoney(ledger.periodAmount, p.currency)}
              />
              <DetailRow label="Pagado" value={formatMoney(ledger.settledAmount, p.currency)} />
              {ledger.creditAdjustments !== 0 ? (
                <DetailRow
                  label="Ajustes y anulaciones"
                  value={formatMoney(ledger.creditAdjustments, p.currency)}
                />
              ) : null}
              <DetailRow
                label="Saldo al cierre"
                value={
                  <span className="tabular-nums">
                    {formatMoney(ledger.currentBalance, p.currency)}
                  </span>
                }
              />
            </>
          )}
        </DetailSection>
      ) : null}

      <section className="flex flex-col gap-2">
        <h3 className="type-caption fg-subtle">Actividad</h3>
        <Card>
          <CardContent>
            <ActivityTimeline items={activity} />
          </CardContent>
        </Card>
      </section>
    </ScrollRevealDetail>
  )
}

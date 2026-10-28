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

/**
 * One line standing in for a section's rows while its fetch resolves or after it
 * fails.
 *
 * The failure case is the load-bearing one. Every query here collapses to `null` on
 * error, and `null` formats as a row of blanks and zeroes — a Saldo anterior of
 * `$ 0` under an outage says "this person is square with us", which is a confident
 * answer to a question we could not reach the server to ask
 *.
 */
function SectionState({ query, label }: { query: DetailQuery<unknown>; label: string }) {
  if (query.isLoading) {
    return <p className="type-body-2 fg-subtle">Cargando {label}…</p>
  }
  // Not loading and still nothing to show: the fetch failed, or it succeeded without
  // the field it was scoped to return. Both mean "we could not read it" — which is
  // the one thing this section must say instead of a zero.
  return <p className="type-body-2 fg-subtle">No pudimos cargar {label}.</p>
}

/**
 * Pago detail (§12) — read-only panel in the master-detail split, on the
 * scroll-reveal scaffold (a centered hero scrolls away to a compact sticky bar).
 * The primary actions live in the summary card; the body stacks the §12.2 sections:
 * Resumen, Desglose (shaped by tipo), Datos de pago, Cuenta corriente and Actividad.
 *
 * Desglose, Datos de pago and Cuenta corriente each read a real record — the
 * period's liquidación, the counterparty's bank account, and the persisted running
 * account. Actividad is still derived from the payment's own state, which is where
 * its facts genuinely live.
 */
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
  /** Compact period picker shown in the detail header (reachable on mobile). */
  periodControl?: ReactNode
}) {
  // Hooks run before the null guard: a detail panel that opens and closes must not
  // change the hook order between renders.
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

  // A liquidación is a thing only a team member has; a proveedor's desglose is the
  // payment's own fields and never waits on a fetch.
  const isMemberPay = p.recipientType === 'collaborator' || p.recipientType === 'employee'
  const awaitsPayout = hasPayoutStatement(p) && (payoutQuery.isLoading || payoutQuery.isError)
  // Keyed off the recipient TYPE, not on `hasPayoutStatement`. A colaboradora
  // payment whose `teamMemberId` is missing (the column is nullable; only the
  // create-time refine enforces it) can never be looked up — and keying off the
  // lookup left that case falling through to a titled section with no rows, no
  // message and no explanation.
  const payoutMissing = isMemberPay && !awaitsPayout && payoutQuery.data === null
  // Gasto fijo / monotributo / plataforma have no counterparty, so no running
  // account and no bank account: the sections are absent, not empty.
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
          // §6 detail focal → the one type-metric hero; keeps its saldoTone.
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
        {/* Rendered only when the payment named one. An origin nobody recorded reads as
            "sin registro", the same as an unregistered date — never as a default account
            that would put this money in a place it may not have come from. */}
        <DetailRow
          label="Medio de pago"
          value={p.treasuryAccountName ?? NO_REGISTRO}
        />
      </DetailSection>

      {/* Named for what it is: the month's liquidación, which several payments to
          the same person share. Calling it "Desglose del pago" would promise a
          breakdown of THIS row that no record holds. */}
      <DetailSection title={isMemberPay ? 'Desglose de la liquidación' : 'Desglose'}>
        {awaitsPayout ? (
          <SectionState query={payoutQuery} label="la liquidación" />
        ) : payoutMissing ? (
          <div className="flex flex-col items-start gap-2">
            <p className="type-body-2 fg-subtle">
              Sin liquidación registrada para {formatMonthYear(p.period)}.
            </p>
            {/* A styled Link, not a Button: `Button` deliberately omits `asChild`
                (see its rule), and this navigates rather than acting. Same token
                treatment as the standalone links on the auth screens. */}
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
              {/* `Cargos` and not `Pagos`: this is what the month ADDED to the debt.
                  The row below it is what was actually paid, and two rows both
                  reading "pagos" meant opposite things. */}
              <DetailRow
                label="Cargos del período"
                value={formatMoney(ledger.periodAmount, p.currency)}
              />
              {/* Money that MOVED. An edit that lowered a total and a cancelled
                  charge are credits too, and used to be summed in here — so a pago
                  corrected downward reported the difference as paid. */}
              <DetailRow label="Pagado" value={formatMoney(ledger.settledAmount, p.currency)} />
              {/* Shown only when there were any: on an account with none, the four
                  remaining rows still close on their own. */}
              {ledger.creditAdjustments !== 0 ? (
                <DetailRow
                  label="Ajustes y anulaciones"
                  value={formatMoney(ledger.creditAdjustments, p.currency)}
                />
              ) : null}
              {/* `al cierre`, not `actual`: on a past month this is what the account
                  closed at, which is not what is owed today. */}
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

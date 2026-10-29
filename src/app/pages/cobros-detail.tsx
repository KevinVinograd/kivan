import type { ReactNode } from 'react'

import { ICON } from '@/app/lib/icon-registry'
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  Separator,
} from '@/app/components/components'
import { KpiSummaryCard } from '@/app/components/patterns'
import {
  formatExchangeRate,
  formatMoney,
  formatMoneyPrecise,
  formatMonthYear,
  formatShortDate,
  NO_REGISTRO,
  TAX_PROFILE_LABEL,
} from './cobranza-format'
import {
  ActivityTimeline,
  DetailRow,
  DetailSection,
  LeadingIcon,
  ScrollRevealDetail,
} from './cobranza-detail-ui'
import {
  balanceOf,
  billingStatusBadge,
  collectionStatusBadge, effectiveCollectionStatus,
  isOverdue,
  receivableActivity,
  receivableInvoiceDate,
  receivableLedger,
  receivableRegisteredPayments,
} from './cobros-format'
import { canInvoice } from './cobros-invoice'
import type { Receivable } from './cobros-mock-data'

export function CobrosDetail({
  receivable,
  allReceivables,
  onClose,
  onGenerateInvoice,
  onAssociateInvoice,
  onMarkCollected,
  onEditFiscalData,
  periodControl,
}: {
  receivable: Receivable | null
  allReceivables: Receivable[]
  onClose: () => void
  onGenerateInvoice: (receivable: Receivable) => void
  onAssociateInvoice: (receivable: Receivable) => void
  onMarkCollected: (receivable: Receivable) => void
  onEditFiscalData: () => void
  periodControl?: ReactNode
}) {
  if (!receivable) return null
  const r = receivable
  const cobro = collectionStatusBadge(effectiveCollectionStatus(r))
  const fact = billingStatusBadge(r.billingStatus)
  const balance = balanceOf(r)
  const registered = receivableRegisteredPayments(r)
  const ledger = receivableLedger(r, allReceivables)
  const activity = receivableActivity(r)
  const invoiceIso = receivableInvoiceDate(r)
  const saldoTone = isOverdue(r) ? 'danger' : balance > 0 ? 'warning' : 'default'
  const errorArca = r.billingStatus === 'error_arca'

  return (
    <ScrollRevealDetail
      name={r.clientName}
      subtitle={`${formatMonthYear(r.period)} · ${r.service}`}
      badges={
        <>
          <Badge variant={cobro.variant}>{cobro.label}</Badge>
          <Badge variant={fact.variant}>{fact.label}</Badge>
        </>
      }
      controls={periodControl}
      onClose={onClose}
    >
      <KpiSummaryCard
        figures={[
          { id: 'monto-total', label: 'Monto total', value: formatMoney(r.totalAmount, r.currency) },
          { id: 'saldo', label: 'Saldo', value: formatMoney(balance, r.currency), tone: saldoTone },
        ]}
        heroId="saldo"
        actions={
          r.status === 'cancelled' ? undefined : (
            <>
              {canInvoice(r) && !errorArca ? (
                <Button variant="solid" color="primary" size="dense" onClick={() => onGenerateInvoice(r)}>
                  Generar factura
                </Button>
              ) : null}
              <Button
                variant="outlined"
                color="primary"
                size="dense"
                onClick={() => onMarkCollected(r)}
              >
                Marcar cobrado
              </Button>
            </>
          )
        }
      />

      <DetailSection title="Resumen">
        <DetailRow label="Cliente" value={r.clientName} />
        <DetailRow label="Período" value={formatMonthYear(r.period)} />
        <DetailRow label="Servicio" value={r.service} />
        <DetailRow label="Monto original" value={formatMoney(r.baseAmount, r.currency)} />
        {r.originalCurrency && r.originalAmount !== undefined && r.fxRate !== undefined ? (
          <DetailRow
            label="Cotización"
            value={
              <span className="type-caption tabular-nums fg-subtle">
                {formatMoneyPrecise(r.originalAmount, r.originalCurrency)} a{' '}
                {formatExchangeRate(r.fxRate)}
              </span>
            }
          />
        ) : null}
        <DetailRow label="Extras" value={formatMoney(r.extraAmount, r.currency)} />
        <DetailRow label="Descuentos" value={formatMoney(r.discountAmount, r.currency)} />
        <Separator />
        <DetailRow
          label="Total"
          value={<span className="tabular-nums">{formatMoney(r.totalAmount, r.currency)}</span>}
        />
        <DetailRow label="Cobrado" value={formatMoney(r.collectedAmount, r.currency)} />
        <DetailRow label="Saldo" value={formatMoney(balance, r.currency)} />
        <DetailRow label="Vencimiento" value={formatShortDate(r.dueDate)} />
      </DetailSection>

      <section className="flex flex-col gap-2">
        <h3 className="type-caption fg-subtle">Facturación</h3>
        <Card>
          <CardContent className="flex flex-col gap-1.5">
            <DetailRow label="Estado" value={<Badge variant={fact.variant}>{fact.label}</Badge>} />
            <DetailRow label="Monotributo" value={TAX_PROFILE_LABEL[r.taxProfileId]} />
            <DetailRow label="Número de factura" value={r.invoiceNumber ?? NO_REGISTRO} />
            <DetailRow
              label="Fecha de emisión"
              value={invoiceIso ? formatShortDate(invoiceIso) : NO_REGISTRO}
            />
            <DetailRow label="CAE" value={r.cae ?? NO_REGISTRO} />
            <DetailRow label="Comprobante" value={NO_REGISTRO} />
          </CardContent>
        </Card>

        {errorArca ? (
          <Alert
            variant="danger"
            footer={
              <>
                <Button variant="solid" color="primary" size="dense" onClick={() => onGenerateInvoice(r)}>
                  Reintentar
                </Button>
                <Button variant="outlined" color="primary" size="dense" onClick={() => onAssociateInvoice(r)}>
                  Asociar factura
                </Button>
                <Button variant="transparent" color="primary" size="dense" onClick={onEditFiscalData}>
                  Editar datos fiscales
                </Button>
              </>
            }
          >
            <AlertTitle>No se pudo conectar con ARCA</AlertTitle>
            <AlertDescription>
              Reintentá la generación o revisá los datos fiscales del cliente.
            </AlertDescription>
          </Alert>
        ) : canInvoice(r) ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outlined" color="primary" size="dense" onClick={() => onGenerateInvoice(r)}>
              Generar factura
            </Button>
            <Button variant="outlined" color="primary" size="dense" onClick={() => onAssociateInvoice(r)}>
              Asociar factura
            </Button>
            {r.billingStatus === 'pending' ? (
              <Button variant="transparent" color="primary" size="dense" onClick={onEditFiscalData}>
                Editar datos fiscales
              </Button>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="type-caption fg-subtle">Cobros registrados</h3>
        <Card>
          <CardContent className="flex flex-col gap-3">
            {registered.length > 0 ? (
              registered.map((payment) => (
                <div key={payment.id} className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <LeadingIcon icon={ICON.payment} />
                    <div className="flex min-w-0 flex-col">
                      <span className="type-body-2 fg-subtle">
                        {formatShortDate(payment.iso)}
                      </span>
                      {payment.account || payment.reference ? (
                        <span className="type-caption truncate fg-subtle">
                          {[payment.account, payment.reference].filter(Boolean).join(' · ')}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <span className="type-body-2 fg-default tabular-nums">
                    {formatMoney(payment.amount, r.currency)}
                  </span>
                </div>
              ))
            ) : (
              <span className="type-body-2 fg-subtle">Sin cobros registrados</span>
            )}
          </CardContent>
        </Card>
      </section>

      <DetailSection title="Cuenta corriente">
        <DetailRow label="Saldo anterior" value={formatMoney(ledger.previousBalance, r.currency)} />
        <DetailRow label="Cobros del período" value={formatMoney(ledger.periodAmount, r.currency)} />
        <DetailRow label="Pagos recibidos" value={formatMoney(ledger.settledAmount, r.currency)} />
        <Separator />
        <DetailRow
          label="Saldo actual"
          value={<span className="tabular-nums">{formatMoney(ledger.currentBalance, r.currency)}</span>}
        />
      </DetailSection>

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

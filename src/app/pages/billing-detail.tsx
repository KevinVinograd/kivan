import type { ReactNode } from 'react'

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
} from '@/app/components/components'
import { KpiSummaryCard } from '@/app/components/patterns'
import {
  formatMoney,
  formatMonthYear,
  formatShortDate,
  NO_REGISTRO,
  TAX_PROFILE_LABEL,
} from './cobranza-format'
import {
  ActivityTimeline,
  DetailRow,
  DetailSection,
  ScrollRevealDetail,
} from './cobranza-detail-ui'
import {
  balanceOf,
  billingStatusBadge,
  collectionStatusBadge, effectiveCollectionStatus,
  isOverdue,
  receivableActivity,
  receivableInvoiceDate,
} from './cobros-format'
import { canInvoice, emitterById, isBilled } from './cobros-invoice'
import type { Receivable } from './cobros-mock-data'

/**
 * Facturación detail (§9 / §10.2) — the read-only panel in the Facturación
 * master-detail split. Foregrounds the invoice lifecycle: the facturación state,
 * the emisor, the comprobante data and the actionable Error ARCA recovery. The
 * primary actions are facturación-only (generar / asociar / enviar / editar datos
 * fiscales); collection actions stay on the Cobros page. Mutations are owned by
 * the page; this panel only invokes callbacks. Built on the shared scroll-reveal
 * scaffold + detail primitives.
 */
export function BillingDetail({
  receivable,
  onClose,
  onGenerateInvoice,
  onAssociateInvoice,
  onSend,
  onEditFiscalData,
  periodControl,
}: {
  receivable: Receivable | null
  onClose: () => void
  onGenerateInvoice: (receivable: Receivable) => void
  onAssociateInvoice: (receivable: Receivable) => void
  onSend: (receivable: Receivable) => void
  onEditFiscalData: (receivable: Receivable) => void
  /** Compact period picker shown in the detail header (reachable on mobile). */
  periodControl?: ReactNode
}) {
  if (!receivable) return null
  const r = receivable
  const cobro = collectionStatusBadge(effectiveCollectionStatus(r))
  const fact = billingStatusBadge(r.billingStatus)
  const balance = balanceOf(r)
  const activity = receivableActivity(r)
  const invoiceIso = receivableInvoiceDate(r)
  const emitter = emitterById(r.emitterTaxProfile ?? r.taxProfileId)
  const saldoTone = isOverdue(r) ? 'danger' : balance > 0 ? 'warning' : 'default'
  const errorArca = r.billingStatus === 'error_arca'
  const billable = canInvoice(r)

  return (
    <ScrollRevealDetail
      name={r.clientName}
      subtitle={`${formatMonthYear(r.period)} · ${r.service}`}
      badges={
        <>
          <Badge variant={fact.variant}>{fact.label}</Badge>
          <Badge variant={cobro.variant}>{cobro.label}</Badge>
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
        heroId={null}
        supportingToken="type-section"
        actions={
          <>
            {billable && !errorArca ? (
              <Button variant="solid" color="primary" size="dense" onClick={() => onGenerateInvoice(r)}>
                Generar factura
              </Button>
            ) : null}
            {billable ? (
              <Button variant="outlined" color="primary" size="dense" onClick={() => onAssociateInvoice(r)}>
                Asociar factura
              </Button>
            ) : null}
            {isBilled(r) ? (
              <Button variant="outlined" color="primary" size="dense" onClick={() => onSend(r)}>
                Enviar
              </Button>
            ) : null}
          </>
        }
      />

      <section className="flex flex-col gap-2">
        <h3 className="type-caption fg-subtle">Facturación</h3>
        <Card>
          <CardContent className="flex flex-col gap-1.5">
            <DetailRow label="Estado" value={<Badge variant={fact.variant}>{fact.label}</Badge>} />
            <DetailRow label="Monotributo" value={TAX_PROFILE_LABEL[r.emitterTaxProfile ?? r.taxProfileId]} />
            <DetailRow label="Número de factura" value={r.invoiceNumber ?? NO_REGISTRO} />
            <DetailRow
              label="Fecha de emisión"
              value={invoiceIso ? formatShortDate(invoiceIso) : NO_REGISTRO}
            />
            <DetailRow label="Punto de venta" value={emitter?.puntoDeVenta ?? NO_REGISTRO} />
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
                <Button variant="transparent" color="primary" size="dense" onClick={() => onEditFiscalData(r)}>
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
        ) : billable ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outlined" color="primary" size="dense" onClick={() => onGenerateInvoice(r)}>
              Generar factura
            </Button>
            <Button variant="outlined" color="primary" size="dense" onClick={() => onAssociateInvoice(r)}>
              Asociar factura
            </Button>
            {r.billingStatus === 'pending' ? (
              <Button variant="transparent" color="primary" size="dense" onClick={() => onEditFiscalData(r)}>
                Editar datos fiscales
              </Button>
            ) : null}
          </div>
        ) : null}
      </section>

      <DetailSection title="Datos fiscales">
        <DetailRow label="Razón social" value={r.businessName ?? NO_REGISTRO} />
        <DetailRow label="CUIT / DNI" value={r.taxId ?? NO_REGISTRO} />
        <DetailRow label="Servicio" value={r.service} />
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

import { cn } from '@/app/lib/utils'
import { hasCapability } from '@hold/shared'
import { useRole } from '@/app/lib/use-role'
import { AFFORDANCE } from '@/app/lib/icon-registry'
import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  IconButton,
  Separator,
} from '@/app/components/components'
import { AiInsight, KpiSummaryCard } from '@/app/components/patterns'
import { PanelContent, SectionHeader } from '@/app/components/templates'
import { DetailRow, DetailSection } from './cobranza-detail-ui'
import type { ClientMonth } from './monthly-operation-mock-data'
import {
  MONOTRIBUTO_FULL_LABEL,
  NO_VALUE,
  clientBillableExtras,
  clientMargin,
  clientMarginPercent,
  clientMonthStatusBadge,
  clientTotalToBill,
  formatCurrency,
  formatDate,
  initials,
  invoiceBadge,
  marginTone,
  paymentBadge,
} from './monthly-operation-format'

const MARGIN_TONE_FG: Record<'default' | 'warning' | 'danger', string> = {
  default: 'fg-default',
  warning: 'fg-warning',
  danger: 'fg-danger',
}

export type MonthlyClientDetailProps = {
  client: ClientMonth | null
  locked: boolean
  onClose: () => void
  onRegisterPayment: (client: ClientMonth) => void
  onMarkInvoiced: (client: ClientMonth) => void
  onIssueInvoice: (client: ClientMonth) => void
  onAddExtra: (client: ClientMonth) => void
  onAddNote: (client: ClientMonth) => void
  onSetEffectiveDate: (client: ClientMonth) => void
}

function EconomicSummary({ client, showProfitability }: { client: ClientMonth; showProfitability: boolean }) {
  const total = clientTotalToBill(client)
  const margin = clientMargin(client)
  const percent = clientMarginPercent(client)
  const tone = MARGIN_TONE_FG[marginTone(percent)]
  return (
    <DetailSection title="Resumen económico">
      <DetailRow label="Fee mensual" value={<span className="tabular-nums">{formatCurrency(client.monthlyFee)}</span>} />
      <DetailRow
        label="Extras facturables"
        value={<span className="tabular-nums">{formatCurrency(clientBillableExtras(client))}</span>}
      />
      <DetailRow
        label="Producciones"
        value={<span className="tabular-nums">{formatCurrency(client.productionsAmount)}</span>}
      />
      <Separator />
      <DetailRow
        label="Total a facturar"
        value={<span className="tabular-nums fg-default">{formatCurrency(total)}</span>}
      />
      {showProfitability && (
        <>
          <Separator />
          <DetailRow
            label="Costo equipo"
            value={
              <span className="tabular-nums">
                {client.teamCost === null ? NO_VALUE : formatCurrency(client.teamCost)}
              </span>
            }
          />
          <DetailRow
            label="Costo producción"
            value={<span className="tabular-nums">{formatCurrency(client.productionCost)}</span>}
          />
          <DetailRow
            label="Margen"
            value={
              <span className={cn('tabular-nums', tone)}>
                {margin === null ? NO_VALUE : formatCurrency(margin)}
              </span>
            }
          />
          <DetailRow
            label="Margen %"
            value={
              <span className={cn('tabular-nums', tone)}>
                {percent === null ? NO_VALUE : `${Math.round(percent)}%`}
              </span>
            }
          />
        </>
      )}
    </DetailSection>
  )
}

function InvoiceActionPanel({
  client,
  locked,
  onMarkInvoiced,
  onIssueInvoice,
}: {
  client: ClientMonth
  locked: boolean
  onMarkInvoiced: (client: ClientMonth) => void
  onIssueInvoice: (client: ClientMonth) => void
}) {
  const invoice = invoiceBadge(client.invoiceStatus)
  return (
    <DetailSection title="Facturación">
      <DetailRow label="Estado" value={<Badge variant={invoice.variant}>{invoice.label}</Badge>} />
      <DetailRow label="Monotributo" value={MONOTRIBUTO_FULL_LABEL[client.monotributo]} />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outlined"
          color="primary"
          size="dense"
          disabled={locked}
          onClick={() => onMarkInvoiced(client)}
        >
          Marcar como facturado
        </Button>
        <Button
          variant="solid"
          color="primary"
          size="dense"
          disabled={locked}
          onClick={() => onIssueInvoice(client)}
        >
          Facturar
        </Button>
      </div>
    </DetailSection>
  )
}

export function MonthlyClientDetail({
  client,
  locked,
  onClose,
  onRegisterPayment,
  onMarkInvoiced,
  onIssueInvoice,
  onAddExtra,
  onAddNote,
  onSetEffectiveDate,
}: MonthlyClientDetailProps) {
  const { capabilities } = useRole()
  if (!client) return null
  const showProfitability = hasCapability(capabilities, 'profitability')
  const status = clientMonthStatusBadge(client.monthStatus)
  const payment = paymentBadge(client.paymentStatus)
  const marginPercent = clientMarginPercent(client)

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <SectionHeader
        title={client.name}
        description={client.clientType}
        leading={
          <Avatar size="lg" active>
            <AvatarFallback>{initials(client.name)}</AvatarFallback>
          </Avatar>
        }
        titleTrailing={<Badge variant={status.variant}>{status.label}</Badge>}
        actions={
          <IconButton variant="transparent" color="primary" aria-label="Cerrar detalle" onClick={onClose}>
            <AFFORDANCE.close className="size-5" aria-hidden />
          </IconButton>
        }
      />
      <PanelContent layout="stacked" flushTop>
        <AiInsight
          variant="ghost"
          headline={
            showProfitability && marginPercent !== null
              ? `${client.name}: ${payment.label.toLowerCase()} · margen ${Math.round(marginPercent)}%.`
              : `${client.name}: ${payment.label.toLowerCase()}.`
          }
        />

        <KpiSummaryCard
          figures={[
            { id: 'total-a-facturar', label: 'Total a facturar', value: formatCurrency(clientTotalToBill(client)) },
          ]}
          heroId="total-a-facturar"
        />

        {(client.monthStatus === 'new' || client.monthStatus === 'churned') && (
          <DetailSection title="Fecha efectiva">
            <DetailRow
              label={client.monthStatus === 'churned' ? 'Baja del mes' : 'Alta del mes'}
              value={client.effectiveDate ? formatDate(client.effectiveDate) : NO_VALUE}
            />
            <Button
              variant={client.effectiveDate ? 'outlined' : 'solid'}
              color="primary"
              size="dense"
              className="self-start"
              disabled={locked}
              onClick={() => onSetEffectiveDate(client)}
            >
              Definir fecha efectiva
            </Button>
          </DetailSection>
        )}

        <EconomicSummary client={client} showProfitability={showProfitability} />

        <DetailSection title="Cobro del mes">
          <DetailRow label="Estado" value={<Badge variant={payment.variant}>{payment.label}</Badge>} />
          <DetailRow label="Cobrado" value={<span className="tabular-nums">{formatCurrency(client.paidAmount)}</span>} />
          <DetailRow label="Fecha de cobro" value={client.paymentDate ? formatDate(client.paymentDate) : NO_VALUE} />
          <Button
            variant="solid"
            color="primary"
            size="dense"
            className="self-start"
            disabled={locked}
            onClick={() => onRegisterPayment(client)}
          >
            Registrar cobro
          </Button>
        </DetailSection>

        <InvoiceActionPanel
          client={client}
          locked={locked}
          onMarkInvoiced={onMarkInvoiced}
          onIssueInvoice={onIssueInvoice}
        />

        <DetailSection title="Equipo asignado">
          {client.team.length > 0 ? (
            client.team.map((member) => (
              <div key={member.id} className="flex items-center gap-3">
                <Avatar size="sm">
                  <AvatarFallback>{initials(member.name)}</AvatarFallback>
                </Avatar>
                <span className="type-body-2 fg-default">{member.name}</span>
                <Badge variant="outline" className="ml-auto">
                  {member.role}
                </Badge>
              </div>
            ))
          ) : (
            <span className="type-body-2 fg-subtle">{NO_VALUE}</span>
          )}
        </DetailSection>

        <DetailSection title="Extras / fuera de scope">
          {client.extras.length > 0 ? (
            client.extras.map((extra) => (
              <div key={extra.id} className="flex items-center justify-between gap-3">
                <span className="type-body-2 fg-default">{extra.description}</span>
                <div className="flex items-center gap-2">
                  <Badge variant={extra.billable ? 'success' : 'neutral'}>
                    {extra.billable ? 'Facturable' : 'No facturable'}
                  </Badge>
                  <span className="type-body-2 tabular-nums fg-default">{formatCurrency(extra.amount)}</span>
                </div>
              </div>
            ))
          ) : (
            <span className="type-body-2 fg-subtle">Sin extras cargados</span>
          )}
          <Button
            variant="outlined"
            color="primary"
            size="dense"
            className="self-start"
            disabled={locked}
            onClick={() => onAddExtra(client)}
          >
            Agregar extra
          </Button>
        </DetailSection>

        <DetailSection title="Notas">
          <span className="type-body-2 fg-default">{client.notes ?? 'Sin notas'}</span>
          <Button
            variant="outlined"
            color="primary"
            size="dense"
            className="self-start"
            disabled={locked}
            onClick={() => onAddNote(client)}
          >
            Agregar nota
          </Button>
        </DetailSection>
      </PanelContent>
    </div>
  )
}

import { AFFORDANCE } from '@/app/lib/icon-registry'
import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  IconButton,
  Separator,
} from '@/app/components/components'
import { KpiSummaryCard } from '@/app/components/patterns'
import { PanelContent, SectionHeader } from '@/app/components/templates'
import { DetailRow, DetailSection } from './cobranza-detail-ui'
import type { ProductionRecord, TeamPayout } from './monthly-operation-mock-data'
import {
  NO_VALUE,
  bankLabel,
  formatCurrency,
  formatDate,
  initials,
  nextStatementAction,
  payoutAdjustmentsTotal,
  payoutBadge,
  payoutTotal,
  productionStatusBadge,
  statementBadge,
} from './monthly-operation-format'

export type MonthlyTeamDetailProps = {
  payout: TeamPayout | null
  productions: ProductionRecord[]
  locked: boolean
  onClose: () => void
  onRegisterPayout: (payout: TeamPayout) => void
  onAddAdjustment: (payout: TeamPayout) => void
  onAdvanceStatement: (payout: TeamPayout) => void
  onEditBank: (payout: TeamPayout) => void
}

/** Current-account section — the statement build-up + its lifecycle/export actions. */
function CurrentAccountSection({
  payout,
  locked,
  onAdvance,
}: {
  payout: TeamPayout
  locked: boolean
  onAdvance: (payout: TeamPayout) => void
}) {
  const statement = statementBadge(payout.statementStatus)
  // Same derivation as the row menu: one legal step, or none once confirmed.
  const advance = nextStatementAction(payout.statementStatus)
  return (
    <DetailSection title="Cuenta corriente">
      <DetailRow label="Estado" value={<Badge variant={statement.variant}>{statement.label}</Badge>} />
      <Separator />
      <DetailRow label="Base mensual" value={<span className="tabular-nums">{formatCurrency(payout.baseAmount)}</span>} />
      <DetailRow
        label="Producciones"
        value={<span className="tabular-nums">{formatCurrency(payout.productionsAmount)}</span>}
      />
      <DetailRow label="Viáticos" value={<span className="tabular-nums">{formatCurrency(payout.viaticsAmount)}</span>} />
      <DetailRow
        label="Extras/ajustes"
        value={<span className="tabular-nums">{formatCurrency(payoutAdjustmentsTotal(payout))}</span>}
      />
      <Separator />
      <DetailRow
        label="Total a pagar"
        value={<span className="tabular-nums fg-default">{formatCurrency(payoutTotal(payout))}</span>}
      />
      <div className="flex flex-wrap gap-2">
        {advance ? (
          <Button
            variant="solid"
            color="primary"
            size="dense"
            disabled={locked}
            onClick={() => onAdvance(payout)}
          >
            {advance.label}
          </Button>
        ) : null}
        {/* Export is not built yet — disabled rather than faking a success toast. */}
        <Button variant="outlined" color="primary" size="dense" disabled>
          <AFFORDANCE.download className="size-4" aria-hidden />
          Exportar
        </Button>
      </div>
    </DetailSection>
  )
}

export function MonthlyTeamDetail({
  payout,
  productions,
  locked,
  onClose,
  onRegisterPayout,
  onAddAdjustment,
  onAdvanceStatement,
  onEditBank,
}: MonthlyTeamDetailProps) {
  if (!payout) return null
  const status = payoutBadge(payout.payoutStatus)
  const bank = bankLabel(payout)

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <SectionHeader
        title={payout.name}
        description={payout.role}
        leading={
          <Avatar size="lg" active>
            <AvatarFallback>{initials(payout.name)}</AvatarFallback>
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
        {/* §6 detail focal → the payout total leads as the panel's one type-metric hero. */}
        <KpiSummaryCard
          figures={[
            { id: 'total-a-pagar', label: 'Total a pagar', value: formatCurrency(payoutTotal(payout)) },
          ]}
          heroId="total-a-pagar"
          actions={
            <>
              <Button
                variant="solid"
                color="primary"
                size="dense"
                disabled={locked}
                onClick={() => onRegisterPayout(payout)}
              >
                Registrar pago
              </Button>
              <Button
                variant="outlined"
                color="primary"
                size="dense"
                disabled={locked}
                onClick={() => onAddAdjustment(payout)}
              >
                Agregar ajuste
              </Button>
            </>
          }
        />

        <DetailSection title="Pago del mes">
          <DetailRow label="Estado" value={<Badge variant={status.variant}>{status.label}</Badge>} />
          <DetailRow label="Fecha de pago" value={payout.payoutDate ? formatDate(payout.payoutDate) : NO_VALUE} />
        </DetailSection>

        <CurrentAccountSection payout={payout} locked={locked} onAdvance={onAdvanceStatement} />

        <DetailSection title="Clientes asignados">
          {payout.clients.length > 0 ? (
            payout.clients.map((client) => (
              <span key={client} className="type-body-2 fg-default">
                {client}
              </span>
            ))
          ) : (
            <span className="type-body-2 fg-subtle">{NO_VALUE}</span>
          )}
        </DetailSection>

        <DetailSection title="Producciones del mes">
          {productions.length > 0 ? (
            productions.map((production) => {
              const badge = productionStatusBadge(production.status)
              return (
                <div key={production.id} className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate type-body-2 fg-default">{production.title}</span>
                    <span className="type-caption fg-subtle">
                      {production.clientName || 'Sin cliente'} · {formatDate(production.date)}
                    </span>
                  </div>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                </div>
              )
            })
          ) : (
            <span className="type-body-2 fg-subtle">Sin producciones este mes</span>
          )}
        </DetailSection>

        <DetailSection title="Datos bancarios">
          {payout.bank ? (
            <>
              <DetailRow label="Banco" value={payout.bank.bankName ?? NO_VALUE} />
              <DetailRow label="Titular" value={payout.bank.accountHolder ?? NO_VALUE} />
              <DetailRow label="CBU / CVU" value={payout.bank.cbuOrCvu ?? NO_VALUE} />
              <DetailRow label="Alias" value={payout.bank.alias ?? NO_VALUE} />
            </>
          ) : (
            <span className="type-body-2 fg-danger">{bank.label}</span>
          )}
          <Button
            variant="outlined"
            color="primary"
            size="dense"
            className="self-start"
            disabled={locked}
            onClick={() => onEditBank(payout)}
          >
            Editar datos bancarios
          </Button>
        </DetailSection>
      </PanelContent>
    </div>
  )
}

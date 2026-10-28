import { type ReactNode } from 'react'
import { useNavigate } from 'react-router'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Button,
} from '@/app/components/components'
import { KpiSummaryCard } from '@/app/components/patterns'
import { buildTrailHref } from '@/app/lib/nav-trail'
import { ScrollRevealDetail, DetailSection } from './cobranza-detail-ui'
import { accountStatusBadge } from './account-ledger-columns'
import { formatCurrency, formatMoney, formatMonthYear, formatShortDate } from './account-ledger-format'
import type { AccountEntity, LedgerEntry, PeriodStatement } from './account-ledger-types'

const ENTITY_SUBTITLE: Record<AccountEntity['entityType'], string> = {
  client: 'Cuenta corriente del cliente',
  teamMember: 'Cuenta corriente de la colaboradora',
  provider: 'Cuenta corriente del proveedor',
}

/** Per-entity statement: a summary card over a period-by-period accordion that
 *  expands to the movements composing each period (PRD §13). */
export function AccountStatementDetail({
  entity,
  statements,
  breadcrumb,
  onClose,
}: {
  entity: AccountEntity
  statements: PeriodStatement[]
  /** Contextual back-trail forwarded to the detail scaffold when the account was
   *  reached via a deep link (so the detail keeps a return path). */
  breadcrumb?: ReactNode
  onClose: () => void
}) {
  const navigate = useNavigate()
  const isClient = entity.entityType === 'client'
  const isProvider = entity.entityType === 'provider'
  const chargedLabel = entity.entityType === 'teamMember' ? 'Generado' : 'Facturado'
  const settledLabel = isClient ? 'Cobrado' : 'Pagado'
  const dueLabel = entity.entityType === 'teamMember' ? 'Fecha de pago' : 'Vencimiento'
  const referenceLabel = isClient ? 'Factura asociada' : 'Concepto'
  // The source-record link per side: a client charge opens its /cobros receivable,
  // a provider charge/payment opens its /pagos record. Colaboradora liquidations
  // have no /pagos record to open (they derive from the team snapshot), so no link.
  const sourceLinkLabel = isClient ? 'Ver cobro' : isProvider ? 'Ver pago' : null
  const badge = accountStatusBadge(entity.status, entity.entityType)
  const latest = statements[0]

  /** Deep-link a movement to its source finance record, seeding the detail, period
   *  and a breadcrumb back to Cuentas corrientes. */
  function viewSource(movement: LedgerEntry) {
    if (!movement.referenceId) return
    const route = isClient ? '/cobros' : '/pagos'
    navigate(
      buildTrailHref(
        `${route}?open=${movement.referenceId}&period=${movement.period}`,
        { label: 'Cuentas corrientes', to: '/cuentas-corrientes' },
        new URLSearchParams(),
      ),
    )
  }

  return (
    <ScrollRevealDetail
      name={entity.name}
      subtitle={ENTITY_SUBTITLE[entity.entityType]}
      badges={<Badge variant={badge.variant}>{badge.label}</Badge>}
      breadcrumb={breadcrumb}
      onClose={onClose}
    >
      <KpiSummaryCard
        heroId="balance"
        figures={[
          // §6 detail focal → the one type-metric hero; the charged/settled/Períodos
          // companions step to the type-metric-2 supporting grid.
          {
            id: 'balance',
            label: 'Saldo actual',
            value: formatCurrency(entity.currentBalance),
            // This account holds one running balance per lane; the hero can show one, and
            // says which. What it leaves out is named rather than folded in: the figure
            // used to be a single accumulator over every lane, subtracting dollars from
            // pesos and printing the result under a "$".
            hint:
              entity.otherLaneCount > 0
                ? `en pesos · ${entity.otherLaneCount} ${entity.otherLaneCount === 1 ? 'movimiento' : 'movimientos'} en otra moneda`
                : 'en pesos',
          },
          {
            id: 'charged',
            label: `${chargedLabel} (último mes)`,
            value: formatCurrency(latest?.charged ?? 0),
            // Peso-scoped like the hero above, and it says so for the same reason: a
            // month billed entirely in another lane reads $ 0 here, which without the
            // note is indistinguishable from a month nobody billed.
            hint: (latest?.otherLaneCount ?? 0) > 0 ? 'en pesos' : undefined,
          },
          {
            id: 'settled',
            label: `${settledLabel} (último mes)`,
            value: formatCurrency(latest?.settled ?? 0),
            hint: (latest?.otherLaneCount ?? 0) > 0 ? 'en pesos' : undefined,
          },
          // §6 ranks the Períodos count Tertiary — it stays quiet, not a supporting KPI.
          { id: 'periods', label: 'Períodos', value: String(statements.length), tertiary: true },
        ]}
      />

      <DetailSection title="Cuenta corriente">
        {statements.length === 0 ? (
          <span className="type-body-2 fg-subtle">Sin movimientos</span>
        ) : (
          <Accordion type="multiple" className="flex flex-col">
            {statements.map((statement) => {
              const periodBadge = accountStatusBadge(statement.status, entity.entityType)
              return (
                <AccordionItem
                  key={statement.period}
                  value={statement.period}
                  className="border-b border-alpha-subtle last:border-b-0"
                >
                  <AccordionTrigger>
                    <div className="flex flex-1 flex-wrap items-center justify-between gap-2 pr-2">
                      <span className="type-button fg-default">
                        {formatMonthYear(statement.period)}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="type-caption fg-subtle">
                          {settledLabel} {formatCurrency(statement.settled)} /{' '}
                          {chargedLabel.toLowerCase()} {formatCurrency(statement.charged)}
                        </span>
                        <span className="tabular-nums type-body-2 fg-default">
                          {formatCurrency(statement.balance)}
                        </span>
                        {/* The three figures above are the peso lane; the badge beside them
                            is decided across every lane. Without this the collapsed row
                            read two peso zeros for a period whose expansion shows a
                            foreign factura. */}
                        {statement.otherLaneCount > 0 ? (
                          <span className="type-caption fg-subtle">
                            +{statement.otherLaneCount} en otra moneda
                          </span>
                        ) : null}
                        <Badge variant={periodBadge.variant}>{periodBadge.label}</Badge>
                      </div>
                    </div>
                  </AccordionTrigger>
                  <AccordionContent>
                    <div className="flex flex-col gap-3">
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-start justify-between gap-4">
                          <span className="type-caption fg-subtle">{dueLabel}</span>
                          <span className="type-body-2 text-right fg-default">
                            {statement.dueDate ? formatShortDate(statement.dueDate) : '—'}
                          </span>
                        </div>
                        <div className="flex items-start justify-between gap-4">
                          <span className="type-caption fg-subtle">{referenceLabel}</span>
                          <span className="type-body-2 text-right fg-default">
                            {statement.reference ?? '—'}
                          </span>
                        </div>
                        {statement.notes ? (
                          <div className="flex items-start justify-between gap-4">
                            <span className="type-caption fg-subtle">Notas</span>
                            <span className="type-body-2 text-right fg-default">{statement.notes}</span>
                          </div>
                        ) : null}
                      </div>
                      <div className="grid grid-cols-[1fr_auto_auto] gap-3 pb-1 type-caption fg-subtle">
                        <span>Movimiento</span>
                        <span className="text-right">Debe / Haber</span>
                        <span className="text-right">Saldo</span>
                      </div>
                      {statement.movements.map((movement) => (
                        <div
                          key={movement.id}
                          className="grid grid-cols-[1fr_auto_auto] items-center gap-3 py-1"
                        >
                          <div className="flex min-w-0 flex-col">
                            <span className="truncate type-body-2 fg-default">
                              {movement.description}
                            </span>
                            <span className="type-caption fg-subtle">
                              {formatShortDate(movement.date)}
                              {sourceLinkLabel && movement.referenceId ? (
                                <>
                                  {' · '}
                                  <Button
                                    variant="transparent"
                                    color="primary"
                                    size="dense"
                                    onClick={() => viewSource(movement)}
                                  >
                                    {sourceLinkLabel}
                                  </Button>
                                </>
                              ) : null}
                            </span>
                          </div>
                          <span
                            className={cnAmount(movement)}
                          >
                            {movement.debit > 0
                              ? formatMoney(movement.debit, movement.currency)
                              : `- ${formatMoney(movement.credit, movement.currency)}`}
                          </span>
                          <span className="text-right tabular-nums type-body-2 fg-default">
                            {formatMoney(movement.balance, movement.currency)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </AccordionContent>
                </AccordionItem>
              )
            })}
          </Accordion>
        )}
      </DetailSection>
    </ScrollRevealDetail>
  )
}

/** Debit reads as a charge (default), credit as a settlement (subtle). */
function cnAmount(movement: LedgerEntry): string {
  return movement.debit > 0
    ? 'text-right tabular-nums type-body-2 fg-default'
    : 'text-right tabular-nums type-body-2 fg-subtle'
}

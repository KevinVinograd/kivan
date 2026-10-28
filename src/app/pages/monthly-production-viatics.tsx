/**
 * The viáticos side of the Producciones tab: whether each one was paid back, the weekly
 * "mark these paid" batch, and what is still owed.
 *
 * HOLD reimburses a content creator's travel within the week, not at month end — the
 * planilla's "Pagos" / "Fecha de pago" columns. These pieces stay writable on a closed
 * month and on a production already in a cobro: paying back travel changes neither what
 * was earned nor what was billed (the API agrees, see `markViaticsPaid`).
 */
import { Badge } from '@/app/components/components'
import type { ProductionRecord } from './monthly-operation-mock-data'
import { NO_VALUE, formatCurrency, formatDate } from './monthly-operation-format'

/** A production with a viático that is still owed. */
export function viaticOwed(p: ProductionRecord): boolean {
  return p.viatics > 0 && !p.viaticsPaidAt
}

/** What is still owed in viáticos across the month's productions. */
export function owedViatics(productions: ProductionRecord[]): { amount: number; count: number } {
  const owed = productions.filter(viaticOwed)
  return { amount: owed.reduce((sum, p) => sum + p.viatics, 0), count: owed.length }
}

/** Hours the way the planilla writes them: 2.5 → "2 h 30 min". */
export function formatDuration(hours: number): string {
  if (hours <= 0) return NO_VALUE
  const h = Math.floor(hours)
  const m = Math.round((hours - h) * 60)
  if (m === 0) return `${h} h`
  return h === 0 ? `${m} min` : `${h} h ${m} min`
}

/**
 * What the client's per-hour service already covered of a production this month:
 * "Dentro de las horas incluidas" when all of it, "2 h incluidas, 1 h se cobra" when part.
 */
export function packCaption(p: ProductionRecord): string {
  const included = p.packHours ?? 0
  const billed = Math.max(0, p.hours - included)
  if (billed < 1e-9) return 'Dentro de las horas incluidas'
  return `${formatDuration(included)} incluidas, ${formatDuration(billed)} se cobran`
}

/** The amount, then whether it was paid back — the two columns the planilla kept. */
export function ViaticsCell({ production }: { production: ProductionRecord }) {
  if (production.viatics <= 0) return <span className="fg-subtle">{NO_VALUE}</span>
  return (
    <div className="flex flex-col items-start gap-1">
      <span className="tabular-nums fg-default">{formatCurrency(production.viatics)}</span>
      {production.viaticsPaidAt ? (
        <Badge variant="success">{`Pagado ${formatDate(production.viaticsPaidAt)}`}</Badge>
      ) : (
        <Badge variant="warning">Sin pagar</Badge>
      )}
    </div>
  )
}

/** The receipt as stored: a link opens it, a file name is shown as written. */
export function ReceiptCell({ receipt }: { receipt?: string }) {
  if (!receipt) return <span className="fg-subtle">{NO_VALUE}</span>
  if (/^https?:\/\//i.test(receipt)) {
    return (
      <a
        href={receipt}
        target="_blank"
        rel="noreferrer"
        className="type-body-2 fg-link underline hover:fg-link-hover"
        onClick={(event) => event.stopPropagation()}
      >
        Ver comprobante
      </a>
    )
  }
  return <span className="type-body-2 fg-default">{receipt}</span>
}

import {
  Checkbox,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/components'
import type { MonthlyFeeSkipReason } from '@/api/receivables'
import { formatMoney } from './cobranza-format'
import {
  billedAmount,
  clashesWithManual,
  emptySelectionFrom,
  hasPricedLines,
  linesOf,
  needsServicePick,
  unresolvedFrom,
  mayDuplicateByGuess,
  serviceOptionsFor,
  type GenerarMesRow,
} from './cobros-generar-mes-selection'

/** Why a client is not billed by this run, in the operator's words. */
export const SKIP_LABEL: Record<MonthlyFeeSkipReason, string> = {
  already_generated: 'Ya generado',
  manual_exists: 'Cargado a mano',
  not_billable: 'Ya no corresponde',
  missing_exchange_rate: 'Falta la cotización',
}

export type Row = GenerarMesRow

/**
 * One client in the month generator: pick it, say which service its retainer falls under,
 * and see what it will be billed.
 *
 * A row the operator ticked but never resolved is marked as LEAVING the run rather than
 * silently disappearing from the count. Excluding it quietly would bill a batch the
 * operator believes includes it.
 */
export function CobrosGenerarMesRow({
  row,
  onToggle,
  onServiceChange,
  onToggleLine,
  onToggleProduction,
}: {
  row: Row
  onToggle: (selected: boolean) => void
  onServiceChange: (service: string) => void
  /** Include or exclude one priced service for THIS month. The contract is untouched. */
  onToggleLine: (lineId: string, included: boolean) => void
  /** Include or hold back one pending production. A held-back one waits for next month. */
  onToggleProduction: (productionId: string, included: boolean) => void
}) {
  const blocked = row.skipReason !== null
  // One source for the figure, shared with the dialog's per-currency total: the row
  // and the total must never state a different amount for the same client.
  const billed = billedAmount(row)
  // Keyed on the derived label and only for UNPRICED rows — a priced row leaves
  // `row.service` empty by design, so the raw check captioned every priced client with
  // "queda fuera" while the same client was being billed two lines below.
  const unresolved = unresolvedFrom([row]).length > 0
  // A priced row the operator emptied: it really does leave the run, and says so in its
  // own words rather than borrowing the no-service-picked sentence.
  //
  // Asked of the EXPORTED rule rather than re-derived here. The count, the request, this
  // caption and the dialog's alert have to agree about which rows leave the run, and the
  // way they stop agreeing is a second copy of the predicate that someone updates alone.
  const emptied = !blocked && emptySelectionFrom([row]).length > 0
  // Both asked through the SAME rules the count and the request use, and kept as two
  // different sentences because they have two different consequences. A clash is
  // DROPPED (the server refuses it); a guessed label beside a hand-made cobro is BILLED,
  // and only the operator can say whether the two are the same money. One caption for both
  // is how "ya tiene un cobro cargado a mano" came to mean opposite things on adjacent rows.
  // Only the ONE service that clashes. Joining the whole array put every hand-made cobro
  // behind the singular "ese servicio", naming reasons that are not the reason.
  const droppedFor = clashesWithManual(row) ? row.service || row.suggestedService : null
  const mayRepeat = mayDuplicateByGuess(row) ? row.manualServices.join(', ') : null

  return (
    <div className="flex items-center gap-3 rounded-control px-2 py-2 hover:bg-alpha-subtle-hover">
      <Checkbox
        checked={row.selected && !blocked}
        disabled={blocked}
        onCheckedChange={(next) => onToggle(next === true)}
        aria-label={row.clientName}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="type-button truncate fg-default">{row.clientName}</span>
        {blocked ? (
          <span className="type-caption fg-subtle">
            {SKIP_LABEL[row.skipReason as MonthlyFeeSkipReason]}
          </span>
        ) : unresolved ? (
          <span className="type-caption fg-warning">Queda fuera, sin servicio elegido</span>
        ) : emptied ? (
          <span className="type-caption fg-warning">
            Queda fuera, sin servicios tildados
          </span>
        ) : droppedFor ? (
          <span className="type-caption fg-warning">
            Ya tiene ese servicio cargado a mano, queda fuera: {droppedFor}
          </span>
        ) : mayRepeat ? (
          <span className="type-caption fg-warning">
            Ya tiene un cobro cargado a mano este mes: {mayRepeat}
          </span>
        ) : row.suggestedService ? (
          <span className="type-caption fg-subtle">{row.suggestedService}</span>
        ) : row.services.length === 0 &&
          row.service === '' &&
          !hasPricedLines(row) &&
          row.productions.length === 0 ? (
          // Only while nothing is picked. Once the operator chooses from the catalog the
          // Select shows it, and repeating "Sin servicios contratados" beside it reads as
          // a contradiction rather than as context. The same for a client whose priced
          // lines or productions are listed right beside it: the labels ticked at signup
          // are not its services, and HOLD read that caption on clients billed by line.
          <span className="type-caption fg-subtle">Sin servicios contratados</span>
        ) : null}
      </div>
      {/* A client whose services are PRICED bills the sum of the ones ticked here, so
          the picker is a checklist and not a single choice. Unticking one leaves it out
          of THIS month only — the contract and the client's fee are untouched, which is
          what the studio asked for ("agregar o deducir servicios brindados o no para un
          mes en particular"). */}
      {/* Services and productions share ONE column: side by side they took the width the
          client's name needs, and the name collapsed to a couple of letters. */}
      {!blocked && (hasPricedLines(row) || row.productions.length > 0) ? (
        <div className="flex min-w-0 flex-col gap-1">
          {linesOf(row).map((line) => {
            const included = row.selectedLineIds?.includes(line.id) ?? false
            return (
              <label key={line.id} className="flex items-center gap-2">
                <Checkbox
                  checked={included}
                  onCheckedChange={(next) => onToggleLine(line.id, next === true)}
                  aria-label={`${line.name} de ${row.clientName}`}
                />
                <span className="type-caption fg-subtle">{line.name}</span>
                <span className="type-caption tabular-nums fg-subtle">
                  {formatMoney(line.price, row.currency)}
                </span>
              </label>
            )
          })}
          {/* Productions delivered and not billed yet, each at the amount logged for it.
              Unticking one holds it back: it is offered again next month, never dropped. */}
          {row.productions.map((production) => {
            const included = row.selectedProductionIds.includes(production.id)
            return (
              <label key={production.id} className="flex items-center gap-2">
                <Checkbox
                  checked={included}
                  onCheckedChange={(next) => onToggleProduction(production.id, next === true)}
                  aria-label={`${production.serviceName}, ${production.title}, de ${row.clientName}`}
                />
                <span className="type-caption fg-subtle">
                  {production.serviceName} · {production.title}
                </span>
                <span className="type-caption tabular-nums fg-subtle">
                  {formatMoney(production.amount, row.currency)}
                </span>
              </label>
            )
          })}
        </div>
      ) : null}
      {!blocked && needsServicePick(row) && !row.suggestedService ? (
        <Select value={row.service} onValueChange={onServiceChange}>
          <SelectTrigger className="w-40" aria-label={`Servicio de ${row.clientName}`}>
            {/* Explicit children, not the default. Without them Radix portals the picked
                item's TEXT out of the listbox and into this value node (react-select
                dist/index.mjs:938, gated on `!valueNodeHasChildren`) — a cross-tree move
                of a text node. On a machine-translated page that node has been replaced
                by a `<font>` wrapper, so the move throws NotFoundError and the app-wide
                ErrorBoundary blanks the screen. This picker is one of the two the crash
                was reported from. `row.service` IS the item label here, so rendering it
                directly costs nothing and Radix falls back to the placeholder while it
                is empty. */}
            <SelectValue placeholder="Elegí el servicio">
              <span>{row.service}</span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {serviceOptionsFor(row).map((service) => (
              <SelectItem key={service} value={service}>
                {service}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      {/* What this client is BILLED, with what it is PRICED at underneath.
          For a peso client with no discount the two are the same number and only one
          line shows. For a dollar retainer the pesos lead, because that is the figure
          going onto the factura and into the cobro; the USD figure stays as context.
          When the month has no rate the conversion does not exist, so only the dollar
          figure shows and the caption beside the name says why the row is out.

          A standing discount stacks on top: the lead figure is net, because that is what
          the run writes, and the rate is named underneath so the operator can see WHY
          the amount is not the retainer they know. Never a bare net figure with no
          explanation — that reads as a wrong fee. */}
      <div className="flex flex-col items-end">
        <span className={`type-body-2 tabular-nums ${blocked ? 'fg-subtle' : 'fg-default'}`}>
          {formatMoney(billed.amount, billed.currency)}
        </span>
        {row.convertedArs === null ? null : (
          <span className="type-caption tabular-nums fg-subtle">
            {formatMoney(row.monthlyFee, row.currency)}
          </span>
        )}
        {/* Keyed on the resolved AMOUNT, not on the rate. A dollar client the month has
            no rate for carries a rate but no priced base, so the lead figure above is the
            undiscounted retainer — captioning it "− 10%" would describe a subtraction that
            did not happen. That row is blocked and will not be billed either way. */}
        {/* The rate only, not "fee − x%": the lead figure is the SELECTION (ticked
            services and productions), and a caption subtracting from the whole retainer
            described an amount that was not the one above it. */}
        {row.discountPercent && row.discountAmount !== null ? (
          <span className="type-caption tabular-nums fg-subtle">
            {`Con ${row.discountPercent}% de descuento`}
          </span>
        ) : null}
      </div>
    </div>
  )
}

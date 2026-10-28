/**
 * One priced service in "Servicios valorizados": its name, how it is billed, its price.
 *
 * The price is committed on blur rather than on every keystroke: each save recomputes the
 * client's fee server-side and invalidates the roster, so a per-character mutation would
 * be a write per digit against the number the whole page is built on.
 */
import { useState } from 'react'
import type { Currency, ServiceBillingMode } from '@hold/shared'

import type { ClientServiceDto } from '@/api/clients'
import {
  Button,
  IconButton,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/components'
import { ICON } from '@/app/lib/icon-registry'
import { formatAmountSeed, parseAmountInput } from './clients-dialogs'
import { formatMoney } from './cobranza-format'
import {
  BILLING_MODE_LABEL,
  BILLING_MODES,
  includedHoursLabel,
  parseIncludedHours,
  remainingOf,
  toMajor,
  toMinor,
} from './clients-service-lines-format'

/**
 * The caption under the name: the mode, and for a one-time price how much of it is
 * already in cobros. "Cobros generados", not "cobrado": in this product "cobrado" means
 * the money arrived, and an anticipo that was billed but not paid has not.
 */
function captionFor(line: ClientServiceDto, currency: Currency): string {
  const mode = BILLING_MODE_LABEL[line.billingMode]
  const pack = includedHoursLabel(line)
  if (pack) return `${mode} · ${pack}`
  if (line.billingMode !== 'one_time' || line.billedMinor === null || line.billedMinor === '0') {
    return mode
  }
  if (remainingOf(line) === 0) return `${mode} · Cobros generados por el total`
  return `${mode} · Cobros generados: ${formatMoney(toMajor(line.billedMinor), currency)} de ${formatMoney(
    toMajor(line.priceMinor),
    currency,
  )}`
}

export function ServiceLineRow({
  line,
  currency,
  canEdit,
  busy,
  onPrice,
  onIncludedHours,
  onMode,
  onCharge,
  onRemove,
}: {
  line: ClientServiceDto
  /** The client's lane. A priced line is the client's money, not always pesos. */
  currency: Currency
  canEdit: boolean
  busy: boolean
  onPrice: (priceMinor: string) => void
  /** Per-hour lines only: the hours a month the retainer includes (null = none). */
  onIncludedHours: (hours: number | null) => void
  onMode: (billingMode: ServiceBillingMode) => void
  /** Only offered on an active one-time line with something left to bill. */
  onCharge: () => void
  onRemove: () => void
}) {
  const [draft, setDraft] = useState(formatAmountSeed(toMajor(line.priceMinor)))
  const includedSeed = line.includedHours ? String(line.includedHours).replace('.', ',') : ''
  const [includedDraft, setIncludedDraft] = useState(includedSeed)
  const chargeable = line.active && line.billingMode === 'one_time' && remainingOf(line) > 0

  return (
    // Stacked when editable (name, then its controls) so every row has the same shape:
    // side by side, a long name pushed the controls to the next line and a short one did
    // not, and the list read as two different layouts.
    <div
      className={
        canEdit ? 'flex flex-col gap-2' : 'flex items-center justify-between gap-3'
      }
    >
      <div className="flex min-w-0 flex-col">
        <span className="type-body-2 fg-default">{line.name}</span>
        <span className="type-caption fg-subtle">{captionFor(line, currency)}</span>
      </div>
      {canEdit ? (
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={line.billingMode}
            disabled={busy}
            onValueChange={(value) => {
              if (value !== line.billingMode) onMode(value as ServiceBillingMode)
            }}
          >
            <SelectTrigger className="w-40" aria-label={`Tipo de cobro de ${line.name}`}>
              {/* Explicit children: without them Radix moves the item's text node into
                  this value node, which throws on a machine-translated page. */}
              <SelectValue>
                <span>{BILLING_MODE_LABEL[line.billingMode]}</span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {BILLING_MODES.map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {BILLING_MODE_LABEL[mode]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="text"
            inputMode="decimal"
            className="w-32 text-right"
            value={draft}
            aria-label={`Precio de ${line.name}`}
            onChange={(event) => setDraft(event.target.value.replace(/[^\d.,]/g, ''))}
            onBlur={() => {
              const price = parseAmountInput(draft)
              // Unchanged, or unreadable: do not fire a write that would either be a no-op
              // or set a price the operator did not type.
              if (price <= 0 || toMinor(price) === line.priceMinor) {
                setDraft(formatAmountSeed(toMajor(line.priceMinor)))
                return
              }
              onPrice(toMinor(price))
            }}
          />
          {line.billingMode === 'per_hour' ? (
            // The pack is committed on blur like the price: each save re-bills the line's
            // productions of every open month.
            <label className="flex items-center gap-1.5">
              <Input
                type="text"
                inputMode="decimal"
                className="w-16 text-right"
                placeholder="0"
                value={includedDraft}
                aria-label={`Horas incluidas por mes de ${line.name}`}
                onChange={(event) => setIncludedDraft(event.target.value.replace(/[^\d.,]/g, ''))}
                onBlur={() => {
                  const hours = parseIncludedHours(includedDraft)
                  if (hours === (line.includedHours ?? null)) {
                    setIncludedDraft(includedSeed)
                    return
                  }
                  onIncludedHours(hours)
                }}
              />
              <span className="type-caption fg-subtle">h incluidas</span>
            </label>
          ) : null}
          {chargeable ? (
            <Button variant="outlined" color="primary" size="dense" disabled={busy} onClick={onCharge}>
              Cobrar
            </Button>
          ) : null}
          <IconButton
            variant="outlined"
            color="danger"
            size="dense"
            aria-label={`Quitar ${line.name}`}
            disabled={busy}
            onClick={onRemove}
          >
            <ICON.delete className="size-4" aria-hidden />
          </IconButton>
        </div>
      ) : (
        <span className="type-body-2 tabular-nums fg-default">
          {formatMoney(toMajor(line.priceMinor), currency)}
        </span>
      )}
    </div>
  )
}

/**
 * The "add a priced service" form at the foot of Servicios valorizados.
 *
 * The TYPE is chosen with the price because it decides what the price means: a month of
 * service, a whole project, or one production. The price label follows it so an operator
 * typing a project price never reads "Precio mensual" above the field.
 */
import { useState } from 'react'
import type { ServiceBillingMode } from '@hold/shared'

import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/components'
import { parseAmountInput } from './clients-dialogs'
import {
  BILLING_MODE_LABEL,
  BILLING_MODES,
  PRICE_LABEL,
  parseIncludedHours,
  toMinor,
} from './clients-service-lines-format'

export function ServiceLineForm({
  available,
  busy,
  onAdd,
}: {
  /** Catalog names the client is not already contracting. */
  available: string[]
  busy: boolean
  /** `reset` is called once the server confirmed the line, so the form clears only then. */
  onAdd: (
    input: { name: string; priceMinor: string; billingMode: ServiceBillingMode; includedHours?: number | null },
    reset: () => void,
  ) => void
}) {
  const [name, setName] = useState('')
  const [mode, setMode] = useState<ServiceBillingMode>('monthly')
  const [priceInput, setPriceInput] = useState('')
  const [includedInput, setIncludedInput] = useState('')

  return (
    <form
      className="flex flex-wrap items-end gap-2 border-t border-alpha-subtle pt-3"
      onSubmit={(event) => {
        event.preventDefault()
        const price = parseAmountInput(priceInput)
        if (!name || price <= 0) return
        const includedHours = mode === 'per_hour' ? parseIncludedHours(includedInput) : null
        onAdd({ name, priceMinor: toMinor(price), billingMode: mode, includedHours }, () => {
          setName('')
          setPriceInput('')
          setIncludedInput('')
          setMode('monthly')
        })
      }}
    >
      <label className="flex min-w-48 flex-1 flex-col gap-1.5">
        <span className="type-caption fg-subtle">Servicio</span>
        <Input
          list="client-service-catalog"
          placeholder="Redes"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        {/* A datalist, not a Select: the catalog is a suggestion and the studio contracts
            things that are not in it ("Branding Etapa 1", "Producción con Celular"). */}
        <datalist id="client-service-catalog">
          {available.map((service) => (
            <option key={service} value={service} />
          ))}
        </datalist>
      </label>
      <div className="flex w-40 flex-col gap-1.5">
        <span className="type-caption fg-subtle">Tipo de cobro</span>
        <Select value={mode} onValueChange={(value) => setMode(value as ServiceBillingMode)}>
          <SelectTrigger aria-label="Tipo de cobro">
            <SelectValue>
              <span>{BILLING_MODE_LABEL[mode]}</span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {BILLING_MODES.map((option) => (
              <SelectItem key={option} value={option}>
                {BILLING_MODE_LABEL[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <label className="flex w-40 flex-col gap-1.5">
        <span className="type-caption fg-subtle">{PRICE_LABEL[mode]}</span>
        <Input
          // Not type="number": es-AR separators, no spinner, no stuck leading zero.
          type="text"
          inputMode="decimal"
          placeholder="0"
          value={priceInput}
          onChange={(event) => setPriceInput(event.target.value.replace(/[^\d.,]/g, ''))}
        />
      </label>
      {mode === 'per_hour' ? (
        <label className="flex w-40 flex-col gap-1.5">
          <span className="type-caption fg-subtle">Horas incluidas por mes</span>
          <Input
            type="text"
            inputMode="decimal"
            placeholder="Ninguna"
            value={includedInput}
            onChange={(event) => setIncludedInput(event.target.value.replace(/[^\d.,]/g, ''))}
          />
        </label>
      ) : null}
      <Button
        type="submit"
        variant="outlined"
        color="primary"
        disabled={busy || !name || parseAmountInput(priceInput) <= 0}
      >
        Agregar
      </Button>
    </form>
  )
}

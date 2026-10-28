import { useState, type ReactNode } from 'react'
import { ASSIGNMENT_AREAS, hasCapability, type AssignmentArea } from '@hold/shared'

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/app/components/components'
import { AFFORDANCE } from '@/app/lib/icon-registry'
import { cn } from '@/app/lib/utils'
import { useRole } from '@/app/lib/use-role'
import { parseAmountInput } from './clients-dialogs'
import { formatCurrency } from './clients-format'

/** Case- and accent-insensitive, so "jose" finds "José" and "nati" finds "Natí". */
function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

export interface SearchOption {
  id: string
  name: string
}

/**
 * A select you can type into, for the lists that grew too long to scroll.
 *
 * HOLD asked for it on 2026-10-01: assigning a person to a client meant scrolling the
 * whole roster for every pick, and the client list the other way round is longer still.
 * It is the DS combobox — `Command` inside a `Popover` — not a hand-rolled filtered
 * list, and its trigger carries the `Select` trigger's tokens so it sits flush beside
 * the Selects in the same dialog.
 *
 * Two details carry weight:
 * - The item VALUE is the id and the name rides in `keywords`, with the filter reading
 *   only the keywords. Matching on the value would match the letters of every uuid,
 *   so typing "b" would surface people whose name has no "b" at all.
 * - `modal` on the Popover. This renders inside a `Dialog`, whose scroll lock would
 *   otherwise swallow the wheel over the portaled list.
 */
export function SearchSelect({
  label,
  options,
  value,
  onChange,
  placeholder,
  emptyText,
}: {
  label: string
  options: SearchOption[]
  value: string
  onChange: (id: string) => void
  placeholder: string
  emptyText: string
}) {
  const [open, setOpen] = useState(false)
  const picked = options.find((option) => option.id === value)

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-label={label}
          disabled={options.length === 0}
          className="flex h-10 w-full items-center justify-between gap-2 rounded-control border border-control bg-control px-3 py-2 type-body-2 outline-none transition-[color,box-shadow,border-color] hover:border-control-hover focus-visible:ring-2 focus-visible:ring-focus disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className={cn('truncate', !picked && 'fg-control-placeholder')}>
            {picked?.name ?? placeholder}
          </span>
          <AFFORDANCE.expandValue className="size-4 shrink-0 fg-control-icon" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command
          filter={(_value, search, keywords) =>
            keywords?.some((keyword) => normalize(keyword).includes(normalize(search))) ? 1 : 0
          }
        >
          <CommandInput placeholder="Buscar…" />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.id}
                  value={option.id}
                  keywords={[option.name]}
                  onSelect={() => {
                    onChange(option.id)
                    setOpen(false)
                  }}
                >
                  <span className="flex-1 truncate">{option.name}</span>
                  {option.id === value ? <AFFORDANCE.selected className="size-4" aria-hidden /> : null}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/**
 * The area a person works in for a client, from the closed list (`ASSIGNMENT_AREAS`).
 *
 * It replaced a free-text field that let the same role reach the database spelled three
 * ways. There is deliberately no default: guessing an area from the person's job title
 * would put a wrong value in a field whose whole point is to be right.
 */
export function AreaSelect({
  value,
  onChange,
}: {
  value: AssignmentArea | ''
  onChange: (area: AssignmentArea) => void
}) {
  return (
    <Select value={value} onValueChange={(next) => onChange(next as AssignmentArea)}>
      <SelectTrigger className="w-full" aria-label="Área en el cliente">
        <SelectValue placeholder="Elegí el área" />
      </SelectTrigger>
      <SelectContent>
        {ASSIGNMENT_AREAS.map((area) => (
          <SelectItem key={area} value={area}>
            {area}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/**
 * The amount typed in "Le pagamos por este cliente", read as es-AR money.
 *
 * `undefined` when the field is EMPTY: nobody has said what this client costs. A typed
 * `0` is a different answer (the studio agreed it costs nothing), so the field is kept as
 * a raw string and read here, never held as a number that would collapse the two.
 */
export function parseCostInput(costInput: string): number | undefined {
  return costInput.trim() === '' ? undefined : parseAmountInput(costInput)
}

function TermsField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="type-caption fg-subtle">{label}</span>
      {children}
    </label>
  )
}

/**
 * The terms of an assignment: area, estimated monthly hours and what the studio pays the
 * person for the client. Shared by both "Asignar" dialogs and "Editar asignación", so a
 * relationship records the same fields whichever side it is created or corrected from,
 * and a field added later reaches all three.
 *
 * The amount is `teamCost` information: without that capability the field is not shown
 * and the API would refuse to write it anyway.
 */
export function AssignmentTermsFields({
  area,
  onAreaChange,
  areaHint,
  hours,
  onHoursChange,
  costInput,
  onCostInputChange,
}: {
  area: AssignmentArea | ''
  onAreaChange: (area: AssignmentArea) => void
  /** Shown under the area, e.g. a legacy free-text value that is not in the list. */
  areaHint?: string
  hours: number
  onHoursChange: (hours: number) => void
  costInput: string
  onCostInputChange: (costInput: string) => void
}) {
  const { capabilities } = useRole()
  const showCost = hasCapability(capabilities, 'teamCost')
  const monthlyCost = parseCostInput(costInput)
  return (
    <>
      <TermsField label="Área">
        <AreaSelect value={area} onChange={onAreaChange} />
        {areaHint ? <span className="type-caption fg-subtle">{areaHint}</span> : null}
      </TermsField>
      <TermsField label="Horas mensuales estimadas">
        <Input
          type="number"
          min={0}
          // Whole hours: the API stores an integer and refuses a fraction with a 400.
          step={1}
          value={hours}
          onChange={(e) => onHoursChange(Math.max(0, Math.round(Number(e.target.value) || 0)))}
        />
      </TermsField>
      {showCost ? (
        <TermsField label="Le pagamos por este cliente (ARS)">
          <Input
            // Not type="number": spinner arrows, a refused free-typed amount, and a stuck
            // leading zero.
            type="text"
            inputMode="decimal"
            placeholder="Sin cargar"
            value={costInput}
            onChange={(e) => onCostInputChange(e.target.value.replace(/[^\d.,]/g, ''))}
          />
          {/* The echo is not decoration. `parseAmountInput` reads es-AR money, so `1.500`
              is one thousand five hundred and not one and a half, and it returns 0 for
              anything it cannot read, which is indistinguishable from a deliberate zero
              unless the operator can see the result. */}
          <span className="type-caption fg-subtle">
            {monthlyCost === undefined
              ? 'Podés dejarlo vacío y cargarlo después'
              : `Se guarda ${formatCurrency(monthlyCost)} por mes`}
          </span>
        </TermsField>
      ) : null}
    </>
  )
}

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

function normalize(text: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
}

export interface SearchOption {
  id: string
  name: string
}

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
          step={1}
          value={hours}
          onChange={(e) => onHoursChange(Math.max(0, Math.round(Number(e.target.value) || 0)))}
        />
      </TermsField>
      {showCost ? (
        <TermsField label="Le pagamos por este cliente (ARS)">
          <Input
            type="text"
            inputMode="decimal"
            placeholder="Sin cargar"
            value={costInput}
            onChange={(e) => onCostInputChange(e.target.value.replace(/[^\d.,]/g, ''))}
          />
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

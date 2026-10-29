import * as React from "react"
import { format, isValid, parse } from "date-fns"
import { es } from "date-fns/locale"

import { cn } from "@/app/lib/utils"
import { AFFORDANCE } from "@/app/lib/icon-registry"
import {
  Calendar,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/app/components/components"

const ISO = "yyyy-MM-dd"

function fromIso(value: string): Date | undefined {
  if (!value) return undefined
  const parsed = parse(value, ISO, new Date())
  return isValid(parsed) ? parsed : undefined
}

const CalendarIcon = AFFORDANCE.datePicker

export interface DatePickerProps {
  value: string
  onChange: (value: string) => void
  clearable?: boolean
  placeholder?: string
  required?: boolean
  disabled?: boolean
  id?: string
  "aria-label"?: string
  className?: string
}

function DatePicker({
  value,
  onChange,
  placeholder = "Seleccionar fecha",
  required,
  disabled,
  clearable,
  id,
  className,
  "aria-label": ariaLabel,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const selected = fromIso(value)
  const canClear = clearable ?? !required

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          data-slot="date-picker-trigger"
          disabled={disabled}
          aria-label={ariaLabel}
          aria-required={required ? true : undefined}
          className={cn(
            "flex h-10 w-full min-w-0 items-center justify-between gap-2 rounded-control border border-control bg-control px-3 py-1 text-left type-body outline-none transition-[color,box-shadow] md:type-body-2",
            "focus-visible:ring-2 focus-visible:ring-focus",
            "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
        >
          <span className={cn("truncate", !selected && "fg-control-placeholder")}>
            {selected ? format(selected, "d 'de' MMM yyyy", { locale: es }) : placeholder}
          </span>
          <CalendarIcon className="size-4 shrink-0 fg-subtle" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          autoFocus
          locale={es}
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => {
            if (date) onChange(format(date, ISO))
            else if (canClear) onChange("")
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

export { DatePicker }

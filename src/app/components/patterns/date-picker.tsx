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

/**
 * DatePicker — pattern composing Popover + Calendar over a token-adapted trigger,
 * for on-brand single-date selection. It replaces the native `<input type="date">`,
 * whose calendar/spinner chrome ignores the token theme (it follows the browser
 * `color-scheme`, not our tokens). The value contract is an ISO `yyyy-MM-dd`
 * string in/out, so it drops into existing string date state without conversion.
 *
 * The trigger is a native `<button>` (not the `Button` primitive, which is not
 * `forwardRef`, so `PopoverTrigger asChild` over it would break) styled with the
 * form-control tokens so it sits flush with sibling Input/Select fields; the
 * calendar glyph comes from `AFFORDANCE.datePicker`. Theme is handled by the
 * tokens of the composed primitives (no `dark:` overrides).
 */

const ISO = "yyyy-MM-dd"

/** Parse an ISO `yyyy-MM-dd` string to a local `Date`, or `undefined` if empty/invalid. */
function fromIso(value: string): Date | undefined {
  if (!value) return undefined
  const parsed = parse(value, ISO, new Date())
  return isValid(parsed) ? parsed : undefined
}

const CalendarIcon = AFFORDANCE.datePicker

export interface DatePickerProps {
  /** Selected date as an ISO `yyyy-MM-dd` string; `""` means no selection. */
  value: string
  /** Receives the new ISO `yyyy-MM-dd` string, or `""` when cleared. */
  onChange: (value: string) => void
  /** Whether re-picking the selected day clears the field (react-day-picker's deselect).
   *
   *  Defaults to `!required`, which is the honest rule rather than a convention every
   *  call site has to remember. On an OPTIONAL date that deselect is the only clear
   *  affordance there is, so suppressing it would make the field write-once. On a
   *  REQUIRED one the same gesture silently empties a value the form gates on, and reads
   *  as the form breaking rather than as a clear. Set it explicitly only to override. */
  clearable?: boolean
  /** Text shown when `value` is empty. */
  placeholder?: string
  /** Marks the trigger `aria-required` (a `<button>` has no native form validation). */
  required?: boolean
  /** Disables the trigger and prevents the popover from opening. */
  disabled?: boolean
  /** Forwarded to the trigger button (for label association). */
  id?: string
  /** Accessible name for the trigger when no visible label is associated. */
  "aria-label"?: string
  /** Layout-only composition on the trigger (no token chrome overrides). */
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
  // A required date defends itself. Leaving this to each call site meant the one field
  // that was fixed by hand got it and seven others kept posting an empty date.
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
          // The trigger above formats its date with `locale: es`; without this the popover
          // that opens on top of it renders month and weekday names in ENGLISH. The field
          // reads "15 de jul 2026" and the calendar over it says "July / Mo Tu We".
          locale={es}
          selected={selected}
          defaultMonth={selected}
          onSelect={(date) => {
            // react-day-picker emits `undefined` when the already-selected day is clicked
            // again. On an optional field that IS the clear affordance, and there is no
            // other one, so it must keep working. On a required field it is the opposite:
            // nothing asked for the clear, and silently emptying the value disabled
            // whatever gates on it with nothing on screen explaining why.
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

import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
  Button,
} from '@/app/components/components'
import { CLIENT_FILTER_FIELDS, type ClientFilterId } from './clients-format'

export type FilterFieldsAccordionProps = {
  /** Current active option value for a field, or `undefined` when the field is unset. */
  valueFor: (id: ClientFilterId) => string | undefined
  /** Toggle a field to an option value, or clear it (pass `undefined`) when re-selecting the active one. */
  onToggle: (id: ClientFilterId, value: string | undefined) => void
}

/**
 * Shared filter body for both client filter popovers (table toolbar + list panel):
 * one accordion section per `CLIENT_FILTER_FIELDS` entry, options as toggleable
 * outlined Buttons whose `selected` state marks the active value (clicking it
 * again clears the field, back to "all"). Sections that already carry an active
 * filter start expanded, so the applied value is visible the moment the popover
 * opens. The two consumers differ only in how a value is read/written, passed in
 * via `valueFor` / `onToggle`.
 */
export function FilterFieldsAccordion({ valueFor, onToggle }: FilterFieldsAccordionProps) {
  const defaultValue = CLIENT_FILTER_FIELDS.filter((field) => valueFor(field.id) != null).map(
    (field) => field.id,
  )
  return (
    <Accordion type="multiple" defaultValue={defaultValue} className="w-full">
      {CLIENT_FILTER_FIELDS.map((field) => {
        const value = valueFor(field.id)
        return (
          <AccordionItem key={field.id} value={field.id}>
            <AccordionTrigger>{field.allLabel}</AccordionTrigger>
            <AccordionContent>
              <div className="flex flex-wrap gap-2">
                {field.options.map((option) => {
                  const selected = value === option.value
                  return (
                    <Button
                      key={option.value}
                      variant="outlined"
                      color="primary"
                      size="dense"
                      selected={selected}
                      onClick={() => onToggle(field.id, selected ? undefined : option.value)}
                    >
                      {option.label}
                    </Button>
                  )
                })}
              </div>
            </AccordionContent>
          </AccordionItem>
        )
      })}
    </Accordion>
  )
}

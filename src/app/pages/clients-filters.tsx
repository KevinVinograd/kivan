import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
  Button,
} from '@/app/components/components'
import { CLIENT_FILTER_FIELDS, type ClientFilterId } from './clients-format'

export type FilterFieldsAccordionProps = {
  valueFor: (id: ClientFilterId) => string | undefined
  onToggle: (id: ClientFilterId, value: string | undefined) => void
}

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

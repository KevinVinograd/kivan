import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
  Button,
} from '@/app/components/components'
import { buildTeamFilterFields, type TeamFilterId } from './team-format'
import { useTeamData } from './team-data'

export type TeamFilterFieldsAccordionProps = {
  /** Current active option value for a field, or `undefined` when the field is unset. */
  valueFor: (id: TeamFilterId) => string | undefined
  /** Toggle a field to an option value, or clear it (pass `undefined`) when re-selecting the active one. */
  onToggle: (id: TeamFilterId, value: string | undefined) => void
}

/**
 * Shared filter body for both team filter popovers (table toolbar + list panel):
 * one accordion section per `TEAM_FILTER_FIELDS` entry, options as toggleable
 * outlined Buttons whose `selected` state marks the active value (clicking it
 * again clears the field, back to "all"). Sections that already carry an active
 * filter start expanded, so the applied value is visible the moment the popover
 * opens. The two consumers differ only in how a value is read/written.
 */
export function TeamFilterFieldsAccordion({ valueFor, onToggle }: TeamFilterFieldsAccordionProps) {
  // Rol + Cliente options come from the LIVE roster/assignments (empty until they exist),
  // so the filter dropdowns never seed from mock people.
  const td = useTeamData()
  const fields = buildTeamFilterFields(
    td.members.map((member) => member.role),
    td.members.flatMap((member) => td.clientsForMember(member.id)),
  )
  const defaultValue = fields.filter((field) => valueFor(field.id) != null).map((field) => field.id)
  return (
    <Accordion type="multiple" defaultValue={defaultValue} className="w-full">
      {fields.map((field) => {
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

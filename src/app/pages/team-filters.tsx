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
  valueFor: (id: TeamFilterId) => string | undefined
  onToggle: (id: TeamFilterId, value: string | undefined) => void
}

export function TeamFilterFieldsAccordion({ valueFor, onToggle }: TeamFilterFieldsAccordionProps) {
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

import { useState } from 'react'
import { ASSIGNMENT_AREAS, hasCapability, type AssignmentArea } from '@hold/shared'

import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  toast,
} from '@/app/components/components'
import { ApiError } from '@/api/client'
import { useRole } from '@/app/lib/use-role'
import { AssignmentTermsFields, parseCostInput } from './assignment-pickers'
import { formatAmountSeed } from './clients-dialogs'
import type { ClientAssignment } from './clients-mock-data'
import { useTeamData } from './team-data'

export type AssignmentPatch = {
  roleOnClient?: AssignmentArea
  estimatedMonthlyHours?: number
  monthlyCost?: number | null
}

function isArea(value: string): value is AssignmentArea {
  return (ASSIGNMENT_AREAS as readonly string[]).includes(value)
}

/**
 * What changed between the stored assignment and the form, as a PATCH body. Only changed
 * keys are present, because every key sent is a write.
 *
 * The amount has three outcomes and they must stay apart:
 * - cleared after having a value → `null`, which ERASES it ("we no longer know");
 * - a typed `0` → `0`, an agreed "costs nothing";
 * - untouched → absent.
 *
 * An empty area is never sent: a row from before the closed list carries free text that
 * the API would now refuse, so it keeps its value until the operator picks a real one.
 */
export function assignmentPatch(
  original: Pick<ClientAssignment, 'roleOnClient' | 'estimatedMonthlyHours' | 'monthlyCost'>,
  form: { area: AssignmentArea | ''; hours: number; costInput: string },
  canSeeCost: boolean,
): AssignmentPatch {
  const patch: AssignmentPatch = {}
  if (form.area && form.area !== original.roleOnClient) patch.roleOnClient = form.area
  if (form.hours !== (original.estimatedMonthlyHours ?? 0)) patch.estimatedMonthlyHours = form.hours
  // Without `teamCost` the stored amount is not even in the row this viewer received, so
  // an empty field says nothing about it and must not erase it.
  if (canSeeCost) {
    const typed = parseCostInput(form.costInput)
    const stored = original.monthlyCost ?? undefined
    if (typed !== stored) patch.monthlyCost = typed === undefined ? null : typed
  }
  return patch
}

/** The stored amount in the notation the field reads back. A stored 0 is an agreed
 *  amount, so it seeds as "0" rather than the empty "never entered". */
function costSeed(monthlyCost: number | undefined): string {
  if (monthlyCost == null) return ''
  return monthlyCost === 0 ? '0' : formatAmountSeed(monthlyCost)
}

/**
 * Correct a live assignment in place (PATCH /assignments/:id): its area, estimated hours
 * and what the studio pays the person for the client.
 *
 * Before this, the only fix for a mistyped amount was ending the assignment and creating
 * another, which rewrites the person's tenure on the client and reads as a staffing change.
 * Opened from both the client's Equipo tab and the person's Clientes asignados.
 */
export function EditAssignmentDialog({
  assignment,
  memberName,
  onClose,
}: {
  assignment: ClientAssignment
  memberName: string
  onClose: () => void
}) {
  const td = useTeamData()
  // The same check `AssignmentTermsFields` makes to show the amount field at all.
  const { capabilities } = useRole()
  const canSeeCost = hasCapability(capabilities, 'teamCost')
  const legacyArea = isArea(assignment.roleOnClient) ? null : assignment.roleOnClient
  const [area, setArea] = useState<AssignmentArea | ''>(
    isArea(assignment.roleOnClient) ? assignment.roleOnClient : '',
  )
  const [hours, setHours] = useState(assignment.estimatedMonthlyHours ?? 0)
  const [costInput, setCostInput] = useState(costSeed(assignment.monthlyCost))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const patch = assignmentPatch(assignment, { area, hours, costInput }, canSeeCost)
  const changed = Object.keys(patch).length > 0

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <form
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault()
            if (!changed || saving) return
            setSaving(true)
            setError(null)
            try {
              // AWAITED: no success toast before the server confirms the row
              //.
              await td.updateMemberAssignment(assignment.id, patch)
              toast.success('Asignación actualizada')
              onClose()
            } catch (caught) {
              // The dialog stays open with what was typed: closing it after a failure
              // loses the input and reads as if it worked.
              setError(
                caught instanceof ApiError && caught.status === 400
                  ? 'No se pudo guardar: la asignación ya terminó o algún dato no es válido.'
                  : caught instanceof ApiError && caught.status === 403
                    ? 'No tenés permiso para editar asignaciones.'
                    : 'No pudimos guardar los cambios. Probá de nuevo.',
              )
            } finally {
              setSaving(false)
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Editar asignación</DialogTitle>
            <DialogDescription>
              {memberName} · {assignment.clientName}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <AssignmentTermsFields
              area={area}
              onAreaChange={setArea}
              areaHint={legacyArea ? `Hoy figura como “${legacyArea}”, que no está en la lista` : undefined}
              hours={hours}
              onHoursChange={setHours}
              costInput={costInput}
              onCostInputChange={setCostInput}
            />
          </div>

          {error ? <p className="type-body-2 fg-danger">{error}</p> : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outlined" color="primary">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" variant="solid" color="primary" disabled={!changed || saving}>
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

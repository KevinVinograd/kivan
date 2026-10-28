import { useState } from 'react'

import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@/app/components/components'
import type { TeamMember, TeamMemberStatus } from './clients-mock-data'
import { TEAM_STATUS_LABEL } from './team-format'
import { useTeamData } from './team-data'

const STATUS_OPTIONS: TeamMemberStatus[] = ['active', 'paused', 'inactive']

/**
 * Bulk "Cambiar estado" dialog: pick a target status and apply it to the selected
 * members in one shot via the shared `setMembersStatus`. The explicit status choice
 * plus the named count is the confirmation surface for this materially-changing
 * action (feedback Section 7); it confirms with a success toast (Section 4).
 */
export function TeamChangeStatusDialog({
  members,
  onClose,
}: {
  members: TeamMember[]
  onClose: () => void
}) {
  const td = useTeamData()
  const [status, setStatus] = useState<TeamMemberStatus>('active')
  const [submitting, setSubmitting] = useState(false)
  const count = members.length
  const isDeactivating = status === 'inactive'

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault()
            if (submitting) return
            setSubmitting(true)
            try {
              await td.setMembersStatus(
                members.map((member) => member.id),
                status,
              )
              toast.success('Estado actualizado')
              onClose()
            } catch {
              toast.error('No se pudo actualizar el estado')
              setSubmitting(false)
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Cambiar estado</DialogTitle>
            <DialogDescription>
              {count} {count === 1 ? 'persona pasará' : 'personas pasarán'} al estado seleccionado.
            </DialogDescription>
          </DialogHeader>

          <label className="flex flex-col gap-1.5">
            <span className="type-caption fg-subtle">Nuevo estado</span>
            <Select value={status} onValueChange={(value) => setStatus(value as TeamMemberStatus)}>
              <SelectTrigger className="w-full" aria-label="Nuevo estado">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {TEAM_STATUS_LABEL[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </label>

          {isDeactivating ? (
            <p className="type-body-2 fg-danger">
              Las personas desactivadas pierden el acceso y salen del roster activo.
            </p>
          ) : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outlined" color="primary">
                Cancelar
              </Button>
            </DialogClose>
            <Button
              type="submit"
              variant="solid"
              color={isDeactivating ? 'danger' : 'primary'}
              disabled={count === 0 || submitting}
            >
              {isDeactivating ? 'Desactivar' : 'Cambiar estado'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

import { useId, useState, type ReactNode } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Checkbox,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
  toast,
} from '@/app/components/components'
import { DatePicker } from '@/app/components/patterns'
import type { Client } from './clients-mock-data'
import { todayIso } from '@/app/lib/iso-date'
import { useTeamData } from './team-data'
import type { AssignmentArea } from '@hold/shared'
import { AssignmentTermsFields, parseCostInput, SearchSelect } from './assignment-pickers'
import { EditAssignmentDialog } from './assignment-edit-dialog'
import { LogProductionForm } from './monthly-production-form'
import { ClientProductionsModule } from './client-productions-module'

/**
 * Client-scoped activity + assignment dialogs (PRD). The Clients detail logs hours
 * and productions and assigns/ends team members from the client's side — against
 * the SAME shared store the Team module mutates (`useTeamData`), so a change here
 * reflects in the member's Team view at once. Member pickers default to the
 * client's ACTIVE assigned members; assigning offers the rest of the roster.
 */
export type ClientTeamDialogState =
  | { kind: 'none' }
  // `selfMemberId`, when set, fixes the entry to the signed-in employee and hides
  // the Persona picker — the employee logs their OWN work against the client. The
  // manager flows omit it and keep the picker.
  | { kind: 'hours'; client: Client; selfMemberId?: string }
  | { kind: 'production'; client: Client; selfMemberId?: string }
  | { kind: 'extra'; client: Client; selfMemberId?: string }
  | { kind: 'assign'; client: Client }
  | { kind: 'end'; client: Client; assignmentId: string; memberName: string }
  | { kind: 'editAssignment'; client: Client; assignmentId: string; memberName: string }
  // A communication lead's window on a client's productions (history, approve, load),
  // opened from the employee roster, which has no client view to hold it.
  | { kind: 'productions'; client: Client }

/** Today, resolved per call. This was `${CURRENT_MONTH}-16` — the 16th of a month pinned to
 *  June 2026 — so every work-log dialog opened pre-filled with a date in the past, and an
 *  operator who did not notice filed the entry there. A function, not a const, so a tab left
 *  open across midnight does not keep offering yesterday. */
const defaultLogDate = () => todayIso()

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="type-caption fg-subtle">{label}</span>
      {children}
    </label>
  )
}

/** Member <Select> bound to a list, with the field label echoed as aria-label. */
function MemberSelect({
  label,
  members,
  value,
  onChange,
  placeholder,
}: {
  label: string
  members: { id: string; name: string }[]
  value: string
  onChange: (id: string) => void
  placeholder: string
}) {
  return (
    <Field label={label}>
      <Select value={value} onValueChange={onChange} disabled={members.length === 0}>
        <SelectTrigger className="w-full" aria-label={label}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {members.map((member) => (
            <SelectItem key={member.id} value={member.id}>
              {member.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  )
}

function LogHoursDialog({
  client,
  onClose,
  selfMemberId,
}: {
  client: Client
  onClose: () => void
  selfMemberId?: string
}) {
  const td = useTeamData()
  const members = td.membersForClient(client.id)
  const scopeId = useId()
  const [memberId, setMemberId] = useState(selfMemberId ?? members[0]?.id ?? '')
  const [date, setDate] = useState(defaultLogDate())
  const [taskType, setTaskType] = useState('')
  const [hours, setHours] = useState(0)
  const [description, setDescription] = useState('')
  const [isOutOfScope, setIsOutOfScope] = useState(false)

  // A client with no assigned members would otherwise trap the manager on a
  // disabled picker + disabled submit; guide them to assign someone first.
  if (!selfMemberId && members.length === 0) {
    return (
      <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Cargar horas</DialogTitle>
            <DialogDescription>{client.name}</DialogDescription>
          </DialogHeader>
          <p className="type-body-2 fg-subtle">
            Este cliente no tiene personas asignadas. Asigná una persona al cliente antes de cargar horas.
          </p>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="solid" color="primary">
                Entendido
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <form
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault()
            try {
              await td.addTimeEntry(memberId, {
                date,
                clientId: client.id,
                clientName: client.name,
                taskType: taskType || 'Tarea general',
                hours,
                description,
                isOutOfScope,
              })
            } catch {
              toast.error('No se pudieron registrar las horas')
              return
            }
            toast.success('Horas registradas')
            onClose()
          }}
        >
          <DialogHeader>
            <DialogTitle>Cargar horas</DialogTitle>
            <DialogDescription>{client.name} · registro de horas del mes</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {selfMemberId ? null : (
              <MemberSelect
                label="Persona"
                members={members}
                value={memberId}
                onChange={setMemberId}
                placeholder="Sin personas asignadas"
              />
            )}
            <Field label="Fecha">
              <DatePicker value={date} onChange={setDate} required aria-label="Fecha" />
            </Field>
            <Field label="Tipo de tarea">
              <Input value={taskType} onChange={(e) => setTaskType(e.target.value)} />
            </Field>
            <Field label="Horas">
              <Input
                type="number"
                min={0}
                step="0.5"
                value={hours}
                onChange={(e) => setHours(Number(e.target.value) || 0)}
              />
            </Field>
          </div>

          <Field label="Descripción">
            <Textarea
              value={description}
              className="min-h-20"
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>

          <label htmlFor={scopeId} className="flex items-center gap-2 type-body-2 fg-default">
            <Checkbox
              id={scopeId}
              checked={isOutOfScope}
              onCheckedChange={(checked) => setIsOutOfScope(!!checked)}
            />
            Es trabajo fuera de scope
          </label>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outlined" color="primary">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" variant="solid" color="primary" disabled={!memberId || hours <= 0}>
              Cargar horas
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * "Cargar producción" from a client: the planilla form with the client (and so its
 * Comunicación account manager) prefilled. The content creator starts EMPTY unless an
 * employee is logging their own work: a client has no single creator, and a pre-picked one
 * is one Enter away from attributing hours and cost to the wrong person.
 */
function LogProductionDialog({
  client,
  onClose,
  selfMemberId,
}: {
  client: Client
  onClose: () => void
  selfMemberId?: string
}) {
  return (
    <LogProductionForm
      prefill={{
        clientId: client.id,
        clientName: client.name,
        ...(selfMemberId ? { creatorId: selfMemberId } : {}),
      }}
      onClose={onClose}
    />
  )
}

function LogExtraDialog({
  client,
  onClose,
  selfMemberId,
}: {
  client: Client
  onClose: () => void
  selfMemberId?: string
}) {
  const td = useTeamData()
  const members = td.membersForClient(client.id)
  const [memberId, setMemberId] = useState(selfMemberId ?? members[0]?.id ?? '')
  const [date, setDate] = useState(defaultLogDate())
  const [description, setDescription] = useState('')
  const [hours, setHours] = useState(0)
  const [amount, setAmount] = useState(0)

  // A client with no assigned members would otherwise trap the manager on a
  // disabled picker + disabled submit; guide them to assign someone first.
  if (!selfMemberId && members.length === 0) {
    return (
      <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Cargar trabajo extra</DialogTitle>
            <DialogDescription>{client.name}</DialogDescription>
          </DialogHeader>
          <p className="type-body-2 fg-subtle">
            Este cliente no tiene personas asignadas. Asigná una persona al cliente antes de cargar trabajo extra.
          </p>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="solid" color="primary">
                Entendido
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault()
            // Logs the member's OWN extra work against the client. It never bills
            // the client (no currentMonthDueAmount mutation) — that is the manager
            // ClientAddExtraWorkDialog, a different flow.
            td.addExtra(memberId, {
              date,
              clientId: client.id,
              clientName: client.name,
              description,
              hours,
              amount,
            })
            toast.success('Trabajo extra cargado')
            onClose()
          }}
        >
          <DialogHeader>
            <DialogTitle>Cargar trabajo extra</DialogTitle>
            <DialogDescription>{client.name} · trabajo extra del mes</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {selfMemberId ? null : (
              <MemberSelect
                label="Persona"
                members={members}
                value={memberId}
                onChange={setMemberId}
                placeholder="Sin personas asignadas"
              />
            )}
            <Field label="Fecha">
              <DatePicker value={date} onChange={setDate} required aria-label="Fecha" />
            </Field>
            <Field label="Horas (opcional)">
              <Input
                type="number"
                min={0}
                step="0.5"
                value={hours}
                onChange={(e) => setHours(Number(e.target.value) || 0)}
              />
            </Field>
            <Field label="Monto (ARS)">
              <Input
                type="number"
                min={0}
                value={amount}
                onChange={(e) => setAmount(Number(e.target.value) || 0)}
              />
            </Field>
          </div>

          <Field label="Descripción">
            <Textarea
              value={description}
              className="min-h-20"
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outlined" color="primary">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" variant="solid" color="primary" disabled={!memberId || amount <= 0}>
              Cargar trabajo extra
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function AssignMemberDialog({ client, onClose }: { client: Client; onClose: () => void }) {
  const td = useTeamData()
  // Offer the roster minus the client's already-active members.
  const activeIds = new Set(td.membersForClient(client.id).map((m) => m.id))
  const candidates = td.members.filter((m) => !activeIds.has(m.id) && m.status !== 'inactive')
  // Starts EMPTY, not on the first candidate: with a searchable list the operator types
  // the name they want, and a pre-picked stranger is one Enter away from being assigned.
  const [memberId, setMemberId] = useState('')
  const [area, setArea] = useState<AssignmentArea | ''>('')
  const [estimatedMonthlyHours, setEstimatedMonthlyHours] = useState(0)
  // Held as the raw string, not a number, because EMPTY and ZERO are different
  // answers: empty means nobody has said what this client costs, `0` means the studio
  // agreed it costs nothing. A numeric state would collapse them at the first render.
  const [costInput, setCostInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const monthlyCost = parseCostInput(costInput)

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <form
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault()
            if (!area) return
            setSaving(true)
            setError(null)
            try {
              // AWAITED. This used to toast success on top of a synchronous local
              // `setData`, so an assignment that never left the browser reported
              // itself saved and was gone on the next reload
              //.
              await td.assignMemberToClient(client.id, memberId, {
                roleOnClient: area,
                ...(estimatedMonthlyHours ? { estimatedMonthlyHours } : {}),
                // `!== undefined`, not truthiness — a typed 0 is an agreed amount and
                // must reach the server, or it silently becomes "never entered".
                ...(monthlyCost !== undefined ? { monthlyCost } : {}),
              })
              toast.success('Miembro asignado al cliente')
              onClose()
            } catch {
              // The dialog STAYS OPEN with the operator's input intact: closing it
              // after a failure loses what they typed and reads as if it worked.
              setError('No pudimos asignar a la persona. Probá de nuevo.')
            } finally {
              setSaving(false)
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Asignar persona</DialogTitle>
            <DialogDescription>{client.name} · sumar una persona al cliente</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Persona">
              <SearchSelect
                label="Persona"
                options={candidates}
                value={memberId}
                onChange={setMemberId}
                placeholder={candidates.length > 0 ? 'Buscá a la persona' : 'Sin personas disponibles'}
                emptyText="No hay nadie con ese nombre"
              />
            </Field>
            <AssignmentTermsFields
              area={area}
              onAreaChange={setArea}
              hours={estimatedMonthlyHours}
              onHoursChange={setEstimatedMonthlyHours}
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
            <Button type="submit" variant="solid" color="primary" disabled={!memberId || !area || saving}>
              {saving ? 'Asignando…' : 'Asignar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function EndAssignmentDialog({
  memberName,
  assignmentId,
  onClose,
}: {
  memberName: string
  assignmentId: string
  onClose: () => void
}) {
  const td = useTeamData()
  const [saving, setSaving] = useState(false)
  return (
    <AlertDialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Quitar a {memberName} del cliente</AlertDialogTitle>
          <AlertDialogDescription>
            La asignación se marca como finalizada. Las horas y producciones ya cargadas se
            conservan en el histórico.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            color="danger"
            disabled={saving}
            onClick={async (event) => {
              // Radix closes an AlertDialogAction on click; prevent that so a failed
              // request does not vanish the confirm along with its own error.
              event.preventDefault()
              setSaving(true)
              try {
                await td.endMemberAssignment(assignmentId)
                toast.success('Miembro removido del cliente')
                onClose()
              } catch {
                toast.error('No pudimos quitar a la persona del cliente.')
              } finally {
                setSaving(false)
              }
            }}
          >
            {saving ? 'Quitando…' : 'Quitar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/**
 * Shown in place of any of the five dialogs when the roster fetch failed.
 *
 * Every one of them picks a person from `membersForClient`, and the store collapses to an empty
 * roster on failure — so each would have opened with an EMPTY member picker, which reads as
 * "this client has no team" rather than "we could not load the team". The user would have closed
 * the dialog and drawn the wrong conclusion about their own data.
 */
function TeamRosterUnavailable({ onClose, onRetry }: { onClose: () => void; onRetry: () => void }) {
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>No pudimos cargar el equipo</DialogTitle>
          <DialogDescription>
            No podemos mostrarte a quién asignar porque no tenemos la lista. No es que no haya
            nadie.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outlined" color="primary" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="solid" color="primary" onClick={onRetry}>
            Reintentar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ClientTeamDialogs({
  state,
  onClose,
  onSwitch,
}: {
  state: ClientTeamDialogState
  onClose: () => void
  /** Move to another dialog (the productions window → "Cargar producción"). */
  onSwitch?: (next: ClientTeamDialogState) => void
}) {
  // Gated ONCE, here, rather than five times inside the dialogs: this dispatcher is the only way
  // any of them mounts, so one check structurally guarantees none of them opens over a roster
  // that never loaded. Five local checks would guarantee it only until someone adds a sixth.
  //
  // The ASSIGNMENT fetch counts as much as the roster: every one of these dialogs picks from
  // `membersForClient`, which reads `clientAssignments`. Under that outage the log dialogs told
  // the operator "Este cliente no tiene personas asignadas" — a fact manufactured from a failed
  // request — and the assign dialog re-offered people who were already on the client, whose
  // assignment then 409s against the live-pair index every single retry.
  const td = useTeamData()
  if (state.kind !== 'none' && (td.isError || td.isAssignmentsError)) {
    return <TeamRosterUnavailable onClose={onClose} onRetry={td.refetch} />
  }

  if (state.kind === 'productions') {
    const { client } = state
    return (
      <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Producciones</DialogTitle>
            <DialogDescription>{client.name}</DialogDescription>
          </DialogHeader>
          <ClientProductionsModule
            client={client}
            onLogProduction={() => onSwitch?.({ kind: 'production', client })}
          />
        </DialogContent>
      </Dialog>
    )
  }
  if (state.kind === 'hours')
    return <LogHoursDialog client={state.client} onClose={onClose} selfMemberId={state.selfMemberId} />
  if (state.kind === 'production')
    return (
      <LogProductionDialog client={state.client} onClose={onClose} selfMemberId={state.selfMemberId} />
    )
  if (state.kind === 'extra')
    return <LogExtraDialog client={state.client} onClose={onClose} selfMemberId={state.selfMemberId} />
  if (state.kind === 'assign') return <AssignMemberDialog client={state.client} onClose={onClose} />
  if (state.kind === 'editAssignment') {
    // Resolved from the store, not carried in the state: the row on screen is whatever the
    // last write returned, and a stale copy would diff against values already replaced.
    const assignment = td
      .assignmentsForClient(state.client.id)
      .find((a) => a.id === state.assignmentId)
    if (!assignment) return null
    return (
      <EditAssignmentDialog assignment={assignment} memberName={state.memberName} onClose={onClose} />
    )
  }
  if (state.kind === 'end')
    return (
      <EndAssignmentDialog
        memberName={state.memberName}
        assignmentId={state.assignmentId}
        onClose={onClose}
      />
    )
  return null
}

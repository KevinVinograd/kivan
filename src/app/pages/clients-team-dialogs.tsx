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

export type ClientTeamDialogState =
  | { kind: 'none' }
  | { kind: 'hours'; client: Client; selfMemberId?: string }
  | { kind: 'production'; client: Client; selfMemberId?: string }
  | { kind: 'extra'; client: Client; selfMemberId?: string }
  | { kind: 'assign'; client: Client }
  | { kind: 'end'; client: Client; assignmentId: string; memberName: string }
  | { kind: 'editAssignment'; client: Client; assignmentId: string; memberName: string }
  | { kind: 'productions'; client: Client }

const defaultLogDate = () => todayIso()

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="type-caption fg-subtle">{label}</span>
      {children}
    </label>
  )
}

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
  const activeIds = new Set(td.membersForClient(client.id).map((m) => m.id))
  const candidates = td.members.filter((m) => !activeIds.has(m.id) && m.status !== 'inactive')
  const [memberId, setMemberId] = useState('')
  const [area, setArea] = useState<AssignmentArea | ''>('')
  const [estimatedMonthlyHours, setEstimatedMonthlyHours] = useState(0)
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
              await td.assignMemberToClient(client.id, memberId, {
                roleOnClient: area,
                ...(estimatedMonthlyHours ? { estimatedMonthlyHours } : {}),
                ...(monthlyCost !== undefined ? { monthlyCost } : {}),
              })
              toast.success('Miembro asignado al cliente')
              onClose()
            } catch {
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
  onSwitch?: (next: ClientTeamDialogState) => void
}) {
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

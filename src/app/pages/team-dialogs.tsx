import { useEffect, useId, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { hasCapability } from '@hold/shared'

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
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { DatePicker } from '@/app/components/patterns'
import { queryKeys } from '@/queries/keys'
import { useRole } from '@/app/lib/use-role'
import type { CompensationModel, EmploymentType, TeamMember, TeamMemberStatus } from './clients-mock-data'
import { ApiError } from '@/api/client'
import { usersApi } from '@/api/users'
import { fetchClients } from './clients-api-data'
import { fetchMemberBank } from './team-api-data'
import type { AssignmentArea } from '@hold/shared'
import { AssignmentTermsFields, parseCostInput, SearchSelect } from './assignment-pickers'
import { LogProductionForm } from './monthly-production-form'
import { todayIso } from '@/app/lib/iso-date'
import {
  EMPLOYMENT_TYPE_LABEL,
  PAYMENT_STATUS_LABEL,
  PAYMENT_TYPE_LABEL,
  TEAM_STATUS_LABEL,
  formatCurrency,
  paymentDueLabel,
} from './team-format'
import {
  useTeamData,
  type TeamMemberFormValues,
} from './team-data'

/**
 * What actually went wrong with an invitation, in the words the operator needs.
 *
 * The statuses are distinct problems with distinct next moves: a taken email or an
 * already-linked person is somebody else's account (go look at Configuración), a rejected
 * payload is a typo in this form, and anything else is not their fault and is worth
 * retrying. One sentence for all four would hide exactly the difference that decides
 * what to do next.
 */
function inviteFailureMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 409) return 'Ese email o esa persona ya tienen una cuenta. Revisalo en Configuración → Miembros y roles.'
    if (error.status === 400) return 'Revisá el email: el servidor no lo aceptó.'
    if (error.status === 403) return 'Tu rol no puede invitar personas.'
  }
  return 'Probá de nuevo en un momento; si sigue, invitala desde su ficha.'
}

export type TeamDialogState =
  | { kind: 'none' }
  | { kind: 'new' }
  | { kind: 'edit'; member: TeamMember }
  | { kind: 'hours'; member: TeamMember }
  | { kind: 'production'; member: TeamMember }
  | { kind: 'expense'; member: TeamMember }
  | { kind: 'extra'; member: TeamMember }
  | { kind: 'approve'; member: TeamMember }
  | { kind: 'approve-extras'; member: TeamMember }
  | { kind: 'pay'; member: TeamMember }
  | { kind: 'confirmPaid'; member: TeamMember }
  | { kind: 'assignClient'; member: TeamMember }
  | { kind: 'invite'; member: TeamMember }
  | { kind: 'deactivate'; member: TeamMember }

/** Today, resolved per call. It was the 16th of a month pinned to June 2026, so every
 *  work-log dialog opened on a date in the past. See team-mock-data.ts for the full story. */
const defaultLogDate = () => todayIso()

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="type-caption fg-subtle">{label}</span>
      {children}
    </label>
  )
}

const STATUS_OPTIONS: TeamMemberStatus[] = ['active', 'paused', 'inactive']
const EMPLOYMENT_OPTIONS: EmploymentType[] = ['full_time', 'part_time', 'freelance', 'external']
const PAYMENT_MODEL_OPTIONS: CompensationModel[] = ['monthly_fixed', 'hourly', 'per_production', 'mixed']

function emptyForm(): TeamMemberFormValues {
  return {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    role: '',
    status: 'active',
    employmentType: 'full_time',
    paymentModel: 'monthly_fixed',
    monthlyAmount: 0,
    hourlyRate: 0,
    productionRate: 0,
    bankName: '',
    accountHolder: '',
    cbuOrCvu: '',
    bankAlias: '',
    taxId: '',
    notes: '',
    grantAccess: false,
    accessRole: 'employee',
  }
}

function formFromMember(member: TeamMember): TeamMemberFormValues {
  const [firstName, ...rest] = member.name.split(' ')
  return {
    firstName: member.firstName ?? firstName ?? '',
    lastName: member.lastName ?? rest.join(' '),
    email: member.email ?? '',
    phone: member.phone ?? '',
    role: member.role,
    status: member.status,
    employmentType: member.employmentType,
    paymentModel: member.compensation.model,
    monthlyAmount: member.compensation.monthlyAmount ?? 0,
    hourlyRate: member.compensation.hourlyRate ?? 0,
    productionRate: member.compensation.productionRate ?? 0,
    bankName: member.bank?.bankName ?? '',
    accountHolder: member.bank?.accountHolder ?? '',
    cbuOrCvu: member.bank?.cbuOrCvu ?? '',
    bankAlias: member.bank?.alias ?? '',
    taxId: member.taxId ?? '',
    notes: member.notes ?? '',
    // Editing never re-invites: access is granted once, and changing it afterwards belongs
    // to Configuración, which owns role changes and deactivation.
    grantAccess: false,
    accessRole: 'employee',
  }
}

function MemberFormDialog({
  mode,
  member,
  onClose,
}: {
  mode: 'new' | 'edit'
  member: TeamMember | null
  onClose: () => void
}) {
  const td = useTeamData()
  const { capabilities, role } = useRole()
  // Bank details are capability-gated (BD001): only shown, fetched and saved for a role that
  // holds `teamBankDetails`. The member DTO never carries them — they ride their own route.
  const canBank = hasCapability(capabilities, 'teamBankDetails')
  // Granting access is a DIFFERENT authority from creating a roster person: `POST /users` is
  // gated by `user.invite` server-side. Someone who may build the roster but not hand out
  // logins must not even see the offer.
  const canInvite = role === 'owner' || role === 'admin'
  const [values, setValues] = useState<TeamMemberFormValues>(
    member ? formFromMember(member) : emptyForm(),
  )
  const [submitting, setSubmitting] = useState(false)
  const queryClient = useQueryClient()
  const accessId = useId()

  // Prefill the bank fields on edit from the gated sub-resource (they are absent from the
  // member DTO, so formFromMember left them blank).
  useEffect(() => {
    if (mode !== 'edit' || !member || !canBank) return
    let alive = true
    fetchMemberBank(member.id)
      .then((bank) => {
        if (!alive || !bank) return
        setValues((prev) => ({
          ...prev,
          bankName: bank.bankName ?? '',
          accountHolder: bank.accountHolder ?? '',
          cbuOrCvu: bank.cbuOrCvu ?? '',
          bankAlias: bank.alias ?? '',
        }))
      })
      .catch(() => {
        // A failed bank fetch leaves the fields blank; the member's other data still edits.
      })
    return () => {
      alive = false
    }
  }, [mode, member, canBank])

  function update<K extends keyof TeamMemberFormValues>(key: K, value: TeamMemberFormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-xl">
        <form
          className="flex flex-col gap-6"
          onSubmit={async (event) => {
            event.preventDefault()
            if (submitting) return
            // The invitation is an email; without one there is nothing to send it to, and
            // the alta would half-succeed. Caught here rather than at the API so the person
            // is never created before the problem is named.
            if (canInvite && values.grantAccess) {
              // Both are required by `POST /users`. Caught here rather than at the API so
              // the person is not created first and the invitation left to fail after.
              if (!values.email.trim()) {
                toast.error('Cargá el email para poder enviar la invitación')
                return
              }
              if (!values.lastName.trim()) {
                toast.error('Cargá el apellido para poder enviar la invitación')
                return
              }
            }
            setSubmitting(true)
            try {
              if (mode === 'edit' && member) {
                await td.updateMember(member.id, values)
                if (canBank) await td.saveMemberBank(member.id, values)
                toast.success('Cambios guardados')
              } else {
                const created = await td.addMember(values)
                if (canBank) await td.saveMemberBank(created.id, values)
                if (canInvite && values.grantAccess) {
                  // Sequential on purpose: the person on the roster is a VALID end state on
                  // its own, so a failed invitation must not undo the alta. It reports the
                  // partial truth and the ficha's own "Invitar" button retries it.
                  try {
                    await usersApi.create({
                      email: values.email,
                      firstName: values.firstName,
                      lastName: values.lastName,
                      role: values.accessRole,
                      teamMemberId: created.id,
                    })
                    await queryClient.invalidateQueries({ queryKey: queryKeys.users.all })
                    toast.success('Persona agregada y invitación enviada')
                  } catch (error) {
                    // The person LANDED — only the invitation failed — so the toast must say
                    // both halves, and it must say WHICH failure, because "ese email ya tiene
                    // cuenta" and "el servidor no respondió" need different next moves. Her
                    // ficha now carries an "Invitar" action, which is the retry.
                    toast.error('Se agregó la persona, pero no se pudo invitar', {
                      description: inviteFailureMessage(error),
                    })
                  }
                } else {
                  toast.success('Persona agregada')
                }
              }
              onClose()
            } catch {
              toast.error('No se pudo guardar la persona')
              setSubmitting(false)
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>{mode === 'new' ? 'Agregar persona' : 'Editar persona'}</DialogTitle>
            <DialogDescription>
              Cargá los datos personales, de pago y bancarios de la persona.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Nombre">
              <Input value={values.firstName} onChange={(e) => update('firstName', e.target.value)} required />
            </Field>
            <Field label="Apellido">
              <Input value={values.lastName} onChange={(e) => update('lastName', e.target.value)} />
            </Field>
            <Field label="Email">
              <Input type="email" value={values.email} onChange={(e) => update('email', e.target.value)} />
            </Field>
            <Field label="Teléfono">
              <Input value={values.phone} onChange={(e) => update('phone', e.target.value)} />
            </Field>
            <Field label="Rol">
              <Input value={values.role} onChange={(e) => update('role', e.target.value)} required />
            </Field>
            <Field label="Estado">
              <Select value={values.status} onValueChange={(v) => update('status', v as TeamMemberStatus)}>
                <SelectTrigger className="w-full" aria-label="Estado">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((status) => (
                    <SelectItem key={status} value={status}>
                      {TEAM_STATUS_LABEL[status]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Tipo de contratación">
              <Select
                value={values.employmentType}
                onValueChange={(v) => update('employmentType', v as EmploymentType)}
              >
                <SelectTrigger className="w-full" aria-label="Tipo de contratación">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EMPLOYMENT_OPTIONS.map((type) => (
                    <SelectItem key={type} value={type}>
                      {EMPLOYMENT_TYPE_LABEL[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Tipo de pago">
              <Select
                value={values.paymentModel}
                onValueChange={(v) => update('paymentModel', v as CompensationModel)}
              >
                <SelectTrigger className="w-full" aria-label="Tipo de pago">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_MODEL_OPTIONS.map((model) => (
                    <SelectItem key={model} value={model}>
                      {PAYMENT_TYPE_LABEL[model]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Le pagamos por mes (ARS)">
              <Input
                type="number"
                min={0}
                value={values.monthlyAmount}
                onChange={(e) => update('monthlyAmount', Number(e.target.value) || 0)}
              />
            </Field>
            <Field label="Le pagamos por hora (ARS)">
              <Input
                type="number"
                min={0}
                value={values.hourlyRate}
                onChange={(e) => update('hourlyRate', Number(e.target.value) || 0)}
              />
            </Field>
            <Field label="Le pagamos por proyecto (ARS)">
              <Input
                type="number"
                min={0}
                value={values.productionRate}
                onChange={(e) => update('productionRate', Number(e.target.value) || 0)}
              />
            </Field>
            <Field label="CUIT / CUIL">
              <Input value={values.taxId} onChange={(e) => update('taxId', e.target.value)} />
            </Field>
            {canBank ? (
              <>
                <Field label="Banco">
                  <Input value={values.bankName} onChange={(e) => update('bankName', e.target.value)} />
                </Field>
                <Field label="Titular">
                  <Input value={values.accountHolder} onChange={(e) => update('accountHolder', e.target.value)} />
                </Field>
                <Field label="CBU / CVU">
                  <Input value={values.cbuOrCvu} onChange={(e) => update('cbuOrCvu', e.target.value)} />
                </Field>
                <Field label="Alias">
                  <Input value={values.bankAlias} onChange={(e) => update('bankAlias', e.target.value)} />
                </Field>
              </>
            ) : null}
          </div>

          <Field label="Notas internas">
            <Textarea
              value={values.notes}
              className="min-h-20"
              onChange={(e) => update('notes', e.target.value)}
            />
          </Field>

          {/* Access lives here so the alta is ONE action: the roster person and their login
              used to be created on two different screens, retyping the same name and email,
              and a person created without the second step could be paid but never sign in.
              Only on create — an existing person is invited from their own ficha. */}
          {mode === 'new' && canInvite ? (
            <div className="flex flex-col gap-3 border-t border-alpha-subtle pt-4">
              <label htmlFor={accessId} className="flex items-center gap-2 type-body-2 fg-default">
                <Checkbox
                  id={accessId}
                  checked={values.grantAccess}
                  onCheckedChange={(checked) => update('grantAccess', !!checked)}
                />
                Darle acceso a la app
              </label>
              {values.grantAccess ? (
                <>
                  <Field label="Rol de acceso">
                    <Select
                      value={values.accessRole}
                      onValueChange={(v) => update('accessRole', v as 'admin' | 'employee')}
                    >
                      <SelectTrigger className="w-full" aria-label="Rol de acceso">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="employee">Equipo</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <p
                    className={
                      values.email.trim()
                        ? 'type-caption fg-subtle'
                        : 'type-caption fg-danger'
                    }
                  >
                    {values.email.trim()
                      ? `Le va a llegar un mail a ${values.email.trim()} para que elija su contraseña y complete sus datos.`
                      : 'Cargá el email arriba: es a donde se manda la invitación.'}
                  </p>
                </>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outlined" color="primary">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" variant="solid" color="primary" disabled={submitting}>
              {mode === 'new' ? 'Agregar persona' : 'Guardar cambios'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Unique {id,name} clients for a member, for the activity forms' client select. */
function useMemberClients(memberId: string): { id: string; name: string }[] {
  const td = useTeamData()
  const seen = new Set<string>()
  const out: { id: string; name: string }[] = []
  for (const assignment of td.assignmentsForMember(memberId)) {
    if (seen.has(assignment.clientId)) continue
    seen.add(assignment.clientId)
    out.push({ id: assignment.clientId, name: assignment.clientName })
  }
  return out
}

function LogHoursDialog({ member, onClose }: { member: TeamMember; onClose: () => void }) {
  const td = useTeamData()
  const clients = useMemberClients(member.id)
  const scopeId = useId()
  const [date, setDate] = useState(defaultLogDate())
  const [clientId, setClientId] = useState(clients[0]?.id ?? '')
  const [taskType, setTaskType] = useState('')
  const [hours, setHours] = useState(0)
  const [description, setDescription] = useState('')
  const [isOutOfScope, setIsOutOfScope] = useState(false)

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <form
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault()
            const client = clients.find((c) => c.id === clientId)
            try {
              await td.addTimeEntry(member.id, {
                date,
                clientId,
                clientName: client?.name ?? 'Sin cliente',
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
            <DialogDescription>{member.name} · registro de horas del mes</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Fecha">
              <DatePicker value={date} onChange={setDate} required aria-label="Fecha" />
            </Field>
            <Field label="Cliente">
              <Select value={clientId} onValueChange={setClientId} disabled={clients.length === 0}>
                <SelectTrigger className="w-full" aria-label="Cliente">
                  <SelectValue placeholder="Sin clientes" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                autoFocus
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
            <Button type="submit" variant="solid" color="primary" disabled={hours <= 0}>
              Cargar horas
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * "Cargar producción" for this person: the planilla form with them as the content creator.
 * Their client is prefilled only when they have exactly one live assignment; with more it
 * would be a guess.
 */
function LogProductionDialog({ member, onClose }: { member: TeamMember; onClose: () => void }) {
  const td = useTeamData()
  const live = td.assignmentsForMember(member.id).filter((a) => a.status !== 'ended')
  const only = live.length === 1 ? live[0] : undefined
  return (
    <LogProductionForm
      prefill={{
        creatorId: member.id,
        ...(only ? { clientId: only.clientId, clientName: only.clientName } : {}),
      }}
      onClose={onClose}
    />
  )
}

function LogExpenseDialog({ member, onClose }: { member: TeamMember; onClose: () => void }) {
  const td = useTeamData()
  const clients = useMemberClients(member.id)
  const [date, setDate] = useState(defaultLogDate())
  const [clientId, setClientId] = useState(clients[0]?.id ?? '')
  const [concept, setConcept] = useState('')
  const [amount, setAmount] = useState(0)

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <form
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault()
            const client = clients.find((c) => c.id === clientId)
            try {
              await td.addExpense(member.id, {
                date,
                clientId: clientId || undefined,
                clientName: client?.name,
                concept: concept || 'Viático',
                amount,
              })
            } catch {
              toast.error('No se pudo cargar el viático')
              return
            }
            toast.success('Viático cargado')
            onClose()
          }}
        >
          <DialogHeader>
            <DialogTitle>Cargar viático</DialogTitle>
            <DialogDescription>{member.name} · gasto del mes</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Fecha">
              <DatePicker value={date} onChange={setDate} required aria-label="Fecha" />
            </Field>
            <Field label="Cliente (opcional)">
              <Select value={clientId} onValueChange={setClientId} disabled={clients.length === 0}>
                <SelectTrigger className="w-full" aria-label="Cliente">
                  <SelectValue placeholder="Sin cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Concepto">
            <Input value={concept} onChange={(e) => setConcept(e.target.value)} required />
          </Field>
          <Field label="Monto (ARS)">
            <Input
              type="number"
              min={0}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value) || 0)}
            />
          </Field>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outlined" color="primary">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" variant="solid" color="primary" disabled={amount <= 0}>
              Cargar viático
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function LogExtraDialog({ member, onClose }: { member: TeamMember; onClose: () => void }) {
  const td = useTeamData()
  const clients = useMemberClients(member.id)
  const [date, setDate] = useState(defaultLogDate())
  const [clientId, setClientId] = useState(clients[0]?.id ?? '')
  const [description, setDescription] = useState('')
  const [hours, setHours] = useState(0)
  const [amount, setAmount] = useState(0)

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-lg">
        <form
          className="flex flex-col gap-4"
          onSubmit={async (event) => {
            event.preventDefault()
            const client = clients.find((c) => c.id === clientId)
            try {
              await td.addExtra(member.id, {
                date,
                clientId,
                clientName: client?.name ?? 'Sin cliente',
                description: description || 'Trabajo extra',
                hours,
                amount,
              })
            } catch {
              toast.error('No se pudo cargar el trabajo extra')
              return
            }
            toast.success('Trabajo extra cargado')
            onClose()
          }}
        >
          <DialogHeader>
            <DialogTitle>Cargar trabajo extra</DialogTitle>
            <DialogDescription>{member.name} · fuera de scope</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Fecha">
              <DatePicker value={date} onChange={setDate} required aria-label="Fecha" />
            </Field>
            <Field label="Cliente">
              <Select value={clientId} onValueChange={setClientId} disabled={clients.length === 0}>
                <SelectTrigger className="w-full" aria-label="Cliente">
                  <SelectValue placeholder="Sin clientes" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            <Input value={description} onChange={(e) => setDescription(e.target.value)} required />
          </Field>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outlined" color="primary">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" variant="solid" color="primary" disabled={amount <= 0}>
              Cargar extra
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Two steps of the same lifecycle, because they are the same decision at two moments:
 * approve the statement (draft → aprobado) and then send the money (aprobado → en
 * proceso). The step is derived from the row's REAL status, never picked by the user —
 * each transition is a conditional server update that refuses an out-of-order call.
 *
 * "Marcar pagado" is deliberately NOT offered here any more: dispatching money and
 * confirming it cleared are two different facts, and collapsing them let the UI
 * declare a payment settled the moment it was sent.
 */
function ApprovePaymentDialog({ member, onClose }: { member: TeamMember; onClose: () => void }) {
  const td = useTeamData()
  const [pending, setPending] = useState(false)
  const statement = td.statementForMember(member.id)
  const isApproved = statement?.status === 'approved'
  const title = isApproved ? 'Pagar' : 'Aprobar pago'
  if (!statement) return <NoStatementDialog member={member} onClose={onClose} />
  return (
    <AlertDialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            {member.name} · {formatCurrency(statement.totalAmount)}.{' '}
            {isApproved
              ? `El pago pasará a estado ${PAYMENT_STATUS_LABEL.processing}.`
              : `El pago pasará a estado ${PAYMENT_STATUS_LABEL.approved}.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose} disabled={pending}>
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            color="primary"
            disabled={pending}
            onClick={async (event) => {
              // The action closes the AlertDialog by default; keep it open so a failed
              // write leaves the user where they were instead of vanishing silently.
              event.preventDefault()
              setPending(true)
              const ok = isApproved
                ? await td.dispatchPayment(member.id)
                : await td.approvePayment(member.id)
              setPending(false)
              if (!ok) {
                toast.error(isApproved ? 'No se pudo iniciar el pago' : 'No se pudo aprobar el pago')
                return
              }
              toast.success(isApproved ? 'Pago iniciado' : 'Pago aprobado')
              onClose()
            }}
          >
            {isApproved ? 'Pagar' : 'Aprobar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/**
 * What a payment dialog shows when the member has no statement for the month. The
 * plan is created in Operación mensual, so this points there instead of offering an
 * action that has nothing to act on.
 */
function NoStatementDialog({ member, onClose }: { member: TeamMember; onClose: () => void }) {
  const td = useTeamData()
  return (
    <AlertDialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {td.isPayoutsError ? 'No se pudo cargar el plan del mes' : 'Sin plan del mes'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {td.isPayoutsError
              ? `No pudimos leer los pagos del mes, así que no sabemos en qué estado está el de ${member.name}. Volvé a intentar.`
              : `${member.name} todavía no tiene un pago armado para este mes. Se arma en Operación mensual.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cerrar</AlertDialogCancel>
          {td.isPayoutsError ? (
            <AlertDialogAction color="primary" onClick={() => td.refetch()}>
              Reintentar
            </AlertDialogAction>
          ) : (
            <AlertDialogAction color="primary" asChild>
              <Link to="/operacion-mensual">Ir a Operación mensual</Link>
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** Review and approve the member's pending trabajos extra in one step. Approving
 *  flips them pending -> approved so they enter the payable total; wiring this is
 *  what makes the "N extras sin aprobar" alert/insight CTA actually resolvable. */
function ApproveExtrasDialog({ member, onClose }: { member: TeamMember; onClose: () => void }) {
  const td = useTeamData()
  const pending = td.extrasForMember(member.id).filter((extra) => extra.status === 'pending')
  const total = pending.reduce((sum, extra) => sum + extra.amount, 0)
  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Aprobar extras</DialogTitle>
          <DialogDescription>
            {member.name} · {pending.length === 1 ? '1 extra pendiente' : `${pending.length} extras pendientes`}
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-2">
          {pending.map((extra) => (
            <li key={extra.id} className="flex items-start justify-between gap-3">
              <span className="type-body-2 fg-default">{extra.description}</span>
              <span className="type-body-2 tabular-nums fg-default">{formatCurrency(extra.amount)}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between">
          <span className="type-caption fg-subtle">Total a aprobar</span>
          <span className="type-button tabular-nums fg-default">{formatCurrency(total)}</span>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outlined" color="primary">
              Cancelar
            </Button>
          </DialogClose>
          <Button
            variant="solid"
            color="primary"
            disabled={pending.length === 0}
            onClick={async () => {
              // Persists now (POST /member-extras/approve flips pending→approved), so a
              // success toast is honest. A failure keeps the dialog open and says so.
              try {
                await td.approveExtras(member.id)
              } catch {
                toast.error('No se pudieron aprobar los extras')
                return
              }
              toast.success('Extras aprobados')
              onClose()
            }}
          >
            Aprobar extras
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Register the outstanding amount as actually paid against the statement. Idempotent
 *  server-side (a key per attempt), so a retry after a network error cannot double-post. */
function PayDifferenceDialog({ member, onClose }: { member: TeamMember; onClose: () => void }) {
  const td = useTeamData()
  const [pending, setPending] = useState(false)
  const statement = td.statementForMember(member.id)
  const destination = member.bank?.alias ?? member.bank?.cbuOrCvu ?? 'la cuenta registrada'
  if (!statement) return <NoStatementDialog member={member} onClose={onClose} />
  const remaining = statement.differenceAmount ?? 0
  return (
    <AlertDialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Pagar diferencia</AlertDialogTitle>
          <AlertDialogDescription>
            {member.name} · Queda por pagar {formatCurrency(remaining)}. Se enviará a {destination}.{' '}
            {paymentDueLabel(statement.dueDate).text}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose} disabled={pending}>
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            color="primary"
            disabled={pending || remaining <= 0}
            onClick={async (event) => {
              event.preventDefault()
              setPending(true)
              const ok = await td.registerPayout(member.id, remaining)
              setPending(false)
              if (!ok) {
                toast.error('No se pudo registrar el pago')
                return
              }
              toast.success(`Pago de ${formatCurrency(remaining)} registrado`)
              onClose()
            }}
          >
            Pagar ahora
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** Confirm a dispatched payment cleared: moves "Pago en proceso" → Pagado. */
function ConfirmPaidDialog({ member, onClose }: { member: TeamMember; onClose: () => void }) {
  const td = useTeamData()
  const [pending, setPending] = useState(false)
  const statement = td.statementForMember(member.id)
  if (!statement) return <NoStatementDialog member={member} onClose={onClose} />
  return (
    <AlertDialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmar pago</AlertDialogTitle>
          <AlertDialogDescription>
            {member.name} · {formatCurrency(statement.totalAmount)}. El pago pasará a estado{' '}
            {PAYMENT_STATUS_LABEL.paid}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose} disabled={pending}>
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction
            color="primary"
            disabled={pending}
            onClick={async (event) => {
              event.preventDefault()
              setPending(true)
              const ok = await td.confirmPaid(member.id)
              setPending(false)
              if (!ok) {
                toast.error('No se pudo confirmar el pago')
                return
              }
              toast.success('Pago marcado como pagado')
              onClose()
            }}
          >
            Confirmar pagado
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/**
 * Assign the member to a client (team-side inverse of the Clients "Asignar
 * persona" flow). Offers the clients the member is not already actively assigned
 * to; writes an active assignment via the shared `assignMemberToClient`.
 */
function AssignClientDialog({ member, onClose }: { member: TeamMember; onClose: () => void }) {
  const td = useTeamData()
  // Real clients roster (the same list the Clientes page reads); the picker offers
  // those the member is not already actively assigned to.
  const clientsQuery = useQuery({
    queryKey: queryKeys.clients.lists(),
    queryFn: fetchClients,
    staleTime: 60_000,
  })
  const allClients = clientsQuery.data ?? []
  const assignedIds = new Set(
    td
      .assignmentsForMember(member.id)
      .filter((assignment) => (assignment.status ?? 'active') !== 'ended')
      .map((assignment) => assignment.clientId),
  )
  const candidates = allClients.filter((client) => !assignedIds.has(client.id))
  /**
   * DERIVED, not seeded once.
   *
   * `useState(candidates[0]?.id ?? '')` ran on the first render, and the clients query
   * is cold on the session's first open — so `candidates` was guaranteed empty at that
   * moment and the value froze at `''`. When the fetch landed the Select re-enabled but
   * kept showing its placeholder, "Sin clientes disponibles", over a list that had
   * loaded, with `Asignar` disabled until the user opened the dropdown by hand.
   */
  const [picked, setPicked] = useState<string | null>(null)
  // Nothing is pre-picked any more: with a searchable list the operator types the client
  // they mean. Still derived, so a pick that drops out of `candidates` clears itself.
  const clientId = candidates.some((c) => c.id === picked) ? picked! : ''
  const setClientId = setPicked
  const [area, setArea] = useState<AssignmentArea | ''>('')
  const [estimatedMonthlyHours, setEstimatedMonthlyHours] = useState(0)
  // Raw string, so EMPTY (nobody said) stays distinct from `0` (agreed to be free).
  // Mirrors the client-side dialog field for field: a relationship assigned from one
  // side must not record less than the same relationship assigned from the other.
  const [costInput, setCostInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const monthlyCost = parseCostInput(costInput)

  /**
   * Either fetch failing means we cannot say which clients this person is free to
   * take. An empty `candidates` renders "Sin clientes disponibles" — a statement —
   * and under an ASSIGNMENT outage `assignedIds` is empty too, so the picker offers
   * clients they are already on and the assignment 409s against the live-pair index
   * on every retry.
   */
  if (clientsQuery.isError || td.isAssignmentsError) {
    return (
      <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Asignar a cliente</DialogTitle>
            <DialogDescription>{member.name}</DialogDescription>
          </DialogHeader>
          <p className="type-body-2 fg-subtle">
            No pudimos cargar los clientes. Probá de nuevo en un momento.
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
            const client = candidates.find((c) => c.id === clientId)
            if (!client || !area) return
            setSaving(true)
            setError(null)
            try {
              // AWAITED — same invariant as the client-side dialog: no success toast
              // before the write resolves.
              await td.assignMemberToClient(client.id, member.id, {
                roleOnClient: area,
                ...(estimatedMonthlyHours ? { estimatedMonthlyHours } : {}),
                // `!== undefined`, not truthiness: a typed 0 is a decision.
                ...(monthlyCost !== undefined ? { monthlyCost } : {}),
              })
              toast.success('Persona asignada al cliente')
              onClose()
            } catch {
              setError('No pudimos asignar la persona al cliente. Probá de nuevo.')
            } finally {
              setSaving(false)
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Asignar a cliente</DialogTitle>
            <DialogDescription>{member.name} · sumar la persona a un cliente</DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Cliente">
              <SearchSelect
                label="Cliente"
                options={candidates}
                value={clientId}
                onChange={setClientId}
                placeholder={candidates.length > 0 ? 'Buscá el cliente' : 'Sin clientes disponibles'}
                emptyText="No hay clientes con ese nombre"
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
            <Button type="submit" variant="solid" color="primary" disabled={!clientId || !area || saving}>
              {saving ? 'Asignando…' : 'Asignar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Confirm before deactivating a person (destructive: removes them from the active
 * roster). No undo is wired, so the AlertDialog is the only safety net; the danger
 * action runs the mutation and confirms with a toast (feedback Section 7).
 */
function DeactivateMemberDialog({ member, onClose }: { member: TeamMember; onClose: () => void }) {
  const td = useTeamData()
  return (
    <AlertDialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Desactivar persona</AlertDialogTitle>
          <AlertDialogDescription>
            {member.name} pasará a estado inactivo y saldrá del listado del equipo. Esta
            acción no se puede deshacer desde acá.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onClose}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            color="danger"
            onClick={async () => {
              try {
                await td.deactivateMember(member.id)
                toast.success('Persona desactivada')
                onClose()
              } catch {
                toast.error('No se pudo desactivar la persona')
              }
            }}
          >
            Desactivar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/**
 * Invite a person who is ALREADY on the roster — the second half of unifying the alta.
 * The roster id is resolved here, so nobody has to go to Configuración and find this same
 * person again in a selector; and the email defaults to the one their ficha already carries,
 * which is the field the two screens used to ask for twice and then never reconcile.
 */
function InviteMemberDialog({ member, onClose }: { member: TeamMember; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [email, setEmail] = useState(member.email ?? '')
  const [accessRole, setAccessRole] = useState<'admin' | 'employee'>('employee')
  const [submitting, setSubmitting] = useState(false)
  // The ficha's own fields first; splitting the display name is only the fallback. And the
  // last name falls back to the FIRST — `inviteUserSchema` requires both to be non-empty, so
  // a one-word roster name ("Sofía", a studio alias) would 400 on every attempt otherwise.
  const [splitFirst, ...splitRest] = member.name.split(' ')
  const firstName = member.firstName ?? splitFirst ?? member.name
  const lastName = member.lastName ?? (splitRest.join(' ') || firstName)

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-6"
          onSubmit={async (event) => {
            event.preventDefault()
            if (submitting) return
            if (!email.trim()) {
              toast.error('Cargá el email para poder enviar la invitación')
              return
            }
            setSubmitting(true)
            try {
              await usersApi.create({
                email: email.trim(),
                firstName,
                lastName,
                role: accessRole,
                teamMemberId: member.id,
              })
              // The shared cache both screens read: without this, Equipo keeps offering
              // "Invitar" to somebody who now has a login (a guaranteed 409) and
              // Configuración's list lags behind. It is the whole reason the key is shared.
              await queryClient.invalidateQueries({ queryKey: queryKeys.users.all })
              toast.success('Invitación enviada')
              onClose()
            } catch (error) {
              toast.error('No se pudo enviar la invitación', {
                description: inviteFailureMessage(error),
              })
              setSubmitting(false)
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Invitar a {member.name}</DialogTitle>
            <DialogDescription>
              Le va a llegar un mail para elegir su contraseña y completar sus datos.
            </DialogDescription>
          </DialogHeader>

          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Rol de acceso">
            <Select value={accessRole} onValueChange={(v) => setAccessRole(v as 'admin' | 'employee')}>
              <SelectTrigger className="w-full" aria-label="Rol de acceso">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="employee">Equipo</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outlined" color="primary">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" variant="solid" color="primary" disabled={submitting}>
              {submitting ? 'Enviando…' : 'Enviar invitación'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function TeamDialogs({ state, onClose }: { state: TeamDialogState; onClose: () => void }) {
  if (state.kind === 'invite') {
    return <InviteMemberDialog member={state.member} onClose={onClose} />
  }
  if (state.kind === 'new' || state.kind === 'edit') {
    return (
      <MemberFormDialog
        mode={state.kind}
        member={state.kind === 'edit' ? state.member : null}
        onClose={onClose}
      />
    )
  }
  if (state.kind === 'hours') return <LogHoursDialog member={state.member} onClose={onClose} />
  if (state.kind === 'production') return <LogProductionDialog member={state.member} onClose={onClose} />
  if (state.kind === 'expense') return <LogExpenseDialog member={state.member} onClose={onClose} />
  if (state.kind === 'extra') return <LogExtraDialog member={state.member} onClose={onClose} />
  if (state.kind === 'approve') return <ApprovePaymentDialog member={state.member} onClose={onClose} />
  if (state.kind === 'approve-extras') return <ApproveExtrasDialog member={state.member} onClose={onClose} />
  if (state.kind === 'pay') return <PayDifferenceDialog member={state.member} onClose={onClose} />
  if (state.kind === 'confirmPaid') return <ConfirmPaidDialog member={state.member} onClose={onClose} />
  if (state.kind === 'assignClient') return <AssignClientDialog member={state.member} onClose={onClose} />
  if (state.kind === 'deactivate') return <DeactivateMemberDialog member={state.member} onClose={onClose} />
  return null
}

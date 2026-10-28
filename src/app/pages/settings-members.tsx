import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  buttonVariants,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@/app/components/components'
import { PanelContent, SectionHeader } from '@/app/components/templates'
import { AFFORDANCE, ICON } from '@/app/lib/icon-registry'
import { cn } from '@/app/lib/utils'
import { ROLE_LABEL, useRole, type Role } from '@/app/lib/use-role'
import { useAuth } from '@/app/lib/auth-store'
import { usersApi, type AssignableUserRole } from '@/api/users'
import { rolesApi } from '@/api/roles'
import { ApiError } from '@/api/client'
import { queryKeys } from '@/queries/keys'
import { fetchTeamMembers } from './team-api-data'
import { Field, SettingGroup } from './settings-fields'

type Member = {
  id: string
  name: string
  email: string
  role: Role
  /** `disabled` members keep their row but cannot log in until reactivated. `pending` is an
   *  invited person who has not set their password yet — distinct from a live `active` login. */
  status: 'active' | 'disabled' | 'pending'
  /** The signed-in person (cannot change their own role or deactivate themselves). */
  isYou?: boolean
  /** Assigned custom WorkspaceRole id (null = built-in role only). Narrows capabilities. */
  workspaceRoleId: string | null
}

/** Query key for the workspace users list (GET /users). */

/** The two assignable roles (ownership is moved via the transfer block, not here). */
const ASSIGNABLE_ROLES: Role[] = ['admin', 'employee']

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

/** Create a workspace member: name, email, role. Email-invite flow — the person sets
 *  their OWN password via the one-time link (emailed, or shown on-screen to hand over). */
function InviteMemberDialog({
  onClose,
  onInvite,
  pending,
  rosterOptions,
}: {
  onClose: () => void
  onInvite: (values: {
    firstName: string
    lastName: string
    email: string
    role: Role
    teamMemberId?: string
  }) => void
  pending: boolean
  /** Roster people not yet linked to a login — pick one to make this login "be" them. */
  rosterOptions: { id: string; name: string }[]
}) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('employee')
  // Sentinel for "no link" (Radix Select forbids an empty-string item value) — the login
  // exists without a roster person.
  const NO_LINK = '__none__'
  const [teamMemberId, setTeamMemberId] = useState<string>(NO_LINK)

  // An Equipo login whose self-view ("mis clientes / mis horas") is to resolve MUST be
  // linked to a roster person (`me.teamMemberId`); without it, client.read.own /
  // member.read.own return empty. So when the role is employee and there is someone to
  // link to, the link is required. (If the roster has nobody unlinked, the picker is
  // hidden and this cannot be enforced — link later from the roster.)
  const employeeNeedsLink = role === 'employee' && rosterOptions.length > 0
  const canSubmit =
    Boolean(email.trim()) &&
    Boolean(firstName.trim()) &&
    Boolean(lastName.trim()) &&
    !pending &&
    (!employeeNeedsLink || teamMemberId !== NO_LINK)

  return (
    <Dialog open onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="sm:max-w-md">
        <form
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault()
            if (!canSubmit) return
            onInvite({
              firstName: firstName.trim(),
              lastName: lastName.trim(),
              email: email.trim(),
              role,
              teamMemberId: teamMemberId === NO_LINK ? undefined : teamMemberId,
            })
          }}
        >
          <DialogHeader>
            <DialogTitle>Agregar miembro</DialogTitle>
            <DialogDescription>
              Se crea la cuenta y le llega un mail con un enlace para que cree su contraseña. Si el
              mail no sale, te mostramos el enlace para pasárselo.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <Field label="Nombre">
              <Input
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="Nombre"
                required
                autoFocus
              />
            </Field>
            <Field label="Apellido">
              <Input
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Apellido"
                required
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="persona@estudio.com"
                required
              />
            </Field>
            <Field label="Rol">
              <Select value={role} onValueChange={(value) => setRole(value as Role)}>
                <SelectTrigger className="w-full" aria-label="Rol">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSIGNABLE_ROLES.map((assignable) => (
                    <SelectItem key={assignable} value={assignable}>
                      {ROLE_LABEL[assignable]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {rosterOptions.length > 0 ? (
              <Field
                label={employeeNeedsLink ? 'Persona del equipo (requerido)' : 'Persona del equipo (opcional)'}
              >
                <Select value={teamMemberId} onValueChange={setTeamMemberId}>
                  <SelectTrigger className="w-full" aria-label="Persona del equipo">
                    {/* Placeholder, not a blank: with "Sin vincular" hidden for Equipo the
                        value matches no item, so without this the field rendered EMPTY and
                        the disabled submit had no visible cause. */}
                    <SelectValue placeholder="Elegí la persona" />
                  </SelectTrigger>
                  <SelectContent>
                    {/* An Equipo login must be linked, so "Sin vincular" is only offered to
                        the other roles; for Equipo the picker forces a real person. */}
                    {!employeeNeedsLink ? <SelectItem value={NO_LINK}>Sin vincular</SelectItem> : null}
                    {rosterOptions.map((member) => (
                      <SelectItem key={member.id} value={member.id}>
                        {member.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {employeeNeedsLink ? (
                  <p
                    className={
                      teamMemberId === NO_LINK ? 'type-caption fg-danger' : 'type-caption fg-subtle'
                    }
                  >
                    {teamMemberId === NO_LINK
                      ? 'Elegí a quién corresponde para poder invitarlo: un miembro de Equipo se vincula a su persona del roster para ver sus clientes y sus horas.'
                      : 'Un miembro de Equipo se vincula a su persona del roster para ver sus clientes y sus horas.'}
                  </p>
                ) : null}
              </Field>
            ) : null}
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outlined" color="primary">
                Cancelar
              </Button>
            </DialogClose>
            <Button type="submit" variant="solid" color="primary" disabled={!canSubmit}>
              {pending ? 'Creando…' : 'Crear miembro'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Miembros y roles — owner/admin section listing the people with access and their
 * role. Every mutation here is REAL: inviting posts `POST /users`, and the role
 * Select and Desactivar/Reactivar call `PATCH /users/:id/role|status`, reconciling
 * by invalidating the users query.
 *
 * Account governance is the one place owner and admin genuinely differ (they see the
 * same money everywhere else). `canGovern` mirrors the server invariants so a row
 * never offers a control the API would refuse. "Transferencia de propiedad" is
 * owner-gated in the UI but NOT yet implemented — confirming it reports that it is
 * unavailable, because no transfer endpoint exists.
 */
export function SettingsMembers() {
  const { role } = useRole()
  const { me } = useAuth()
  const queryClient = useQueryClient()
  // The workspace's real users (GET /users, owner+admin) — the query IS the list, so a
  // create or role change reconciles by invalidating it (no local copy to drift).
  const { data: userDtos } = useQuery({ queryKey: queryKeys.users.all, queryFn: usersApi.list, staleTime: 60_000 })
  const members: Member[] = (userDtos ?? []).map((u) => ({
    id: u.id,
    name: `${u.firstName} ${u.lastName}`.trim() || u.email,
    email: u.email,
    role: u.role as Role,
    status: u.status === 'disabled' ? 'disabled' : u.status === 'pending' ? 'pending' : 'active',
    isYou: me?.email === u.email,
    workspaceRoleId: u.workspaceRoleId,
  }))

  // The roster people available to link a NEW login to: everyone on the team who is not
  // already tied to a login (the link is 1:1). Feeds the invite dialog's optional picker.
  const { data: roster } = useQuery({
    queryKey: queryKeys.team.roster(),
    queryFn: fetchTeamMembers,
    staleTime: 60_000,
  })
  const linkedMemberIds = new Set(
    (userDtos ?? []).map((u) => u.teamMemberId).filter((id): id is string => Boolean(id)),
  )
  const rosterOptions = (roster ?? [])
    .filter((member) => member.status !== 'inactive' && !linkedMemberIds.has(member.id))
    .map((member) => ({ id: member.id, name: member.name }))

  const [transferTo, setTransferTo] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)
  // Set when a member was created but the invitation email did not go out — the
  // one-time set-password link is shown so the admin can hand it over.
  const [inviteLink, setInviteLink] = useState<string | null>(null)
  const [removeTarget, setRemoveTarget] = useState<Member | null>(null)
  const [resetTarget, setResetTarget] = useState<Member | null>(null)
  // Set when a reset link was minted but the email did not go out — shown so the admin
  // can hand it over, exactly like the invite fallback.
  const [resetLink, setResetLink] = useState<string | null>(null)
  const [transferConfirm, setTransferConfirm] = useState(false)

  const others = members.filter((member) => !member.isYou)

  /**
   * Whether the signed-in person may change this member's role or status. Mirrors the
   * server invariants in `settings.service.ts` so the row never offers a control the
   * API would refuse: the owner is untouchable by anyone, and an admin is touchable
   * only by the owner. Without this the admin got a role Select and a red Desactivar
   * that answered with a generic "no se pudo" toast — an affordance that lies.
   */
  const canGovern = (targetRole: Role): boolean =>
    targetRole !== 'owner' && (targetRole !== 'admin' || role === 'owner')

  const invalidateUsers = () => queryClient.invalidateQueries({ queryKey: queryKeys.users.all })

  // Custom roles for the assign control — owner-only (assign is owner-gated server-side).
  const { data: allRoles } = useQuery({
    queryKey: ['roles'],
    queryFn: rolesApi.list,
    staleTime: 60_000,
    enabled: role === 'owner',
  })
  const customRoles = (allRoles ?? []).filter((r) => !r.isSystem)
  // The system role that matches a built-in role — assigning it clears any custom narrowing.
  const systemRoleIdFor = (builtIn: Role): string | undefined =>
    (allRoles ?? []).find((r) => r.isSystem && r.key === builtIn)?.id
  const BASE_ROLE = '__base__'
  const assignRoleMutation = useMutation({
    mutationFn: ({ userId, roleId }: { userId: string; roleId: string }) =>
      rolesApi.assign(userId, roleId),
    onSuccess: invalidateUsers,
    onError: () => toast.error('No se pudo asignar el rol'),
  })
  function assignRole(member: Member, value: string) {
    const roleId = value === BASE_ROLE ? systemRoleIdFor(member.role) : value
    if (!roleId) return
    assignRoleMutation.mutate({ userId: member.id, roleId })
  }

  // Creating a member is a real write (POST /users): the API hashes the password the
  // owner set and the person can sign in with it right away.
  const createMutation = useMutation({
    mutationFn: usersApi.create,
    onSuccess: async (result) => {
      await invalidateUsers()
      setInviteOpen(false)
      if (result.invite.mailed) {
        toast.success('Invitación enviada por email')
      } else {
        // Mail off / failed: keep the one-time link on-screen to hand over by hand.
        setInviteLink(result.invite.link)
      }
    },
    onError: () => toast.error('No se pudo crear el miembro. Revisá el email (¿ya existe?).'),
  })

  const roleMutation = useMutation({
    mutationFn: ({ id, nextRole }: { id: string; nextRole: AssignableUserRole }) =>
      usersApi.changeRole(id, nextRole),
    onSuccess: async () => {
      await invalidateUsers()
      toast.success('Rol actualizado')
    },
    onError: () => toast.error('No se pudo actualizar el rol'),
  })

  function setMemberRole(id: string, nextRole: Role) {
    // Ownership is not assignable through this control (the API only takes admin/employee).
    if (nextRole === 'owner') return
    roleMutation.mutate({ id, nextRole })
  }

  // Deactivating is the real "revoke access": the API disables the user, kills their
  // sessions and blocks login. It is reversible, so members are never destroyed.
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'active' | 'disabled' }) =>
      usersApi.changeStatus(id, status),
    onSuccess: async (_data, variables) => {
      await invalidateUsers()
      toast.success(variables.status === 'disabled' ? 'Miembro desactivado' : 'Miembro reactivado')
    },
    onError: () => toast.error('No se pudo cambiar el estado del miembro'),
  })

  // Recovery path for a lockout: the API emails the member a one-time link to choose their
  // own new password (reusing the invite flow). Nothing to reconcile in the list. When mail
  // is off/failed the link comes back so the admin hands it over — same fallback as invites.
  const resetMutation = useMutation({
    mutationFn: (id: string) => usersApi.sendPasswordReset(id),
    onSuccess: (result) => {
      setResetTarget(null)
      if (result.mailed || !result.link) {
        toast.success('Le enviamos un mail para restablecer su contraseña')
      } else {
        setResetLink(result.link)
      }
    },
    // The server's refusals here are specific and actionable ("needs mail delivery
    // enabled", "could not be emailed"), and they are reachable from a UI that looks
    // permissive: `canGovern` mirrors the server's hierarchy off a members list cached for
    // a minute with no refetch on focus, so a role changed in another session leaves this
    // button rendered. Collapsing that into "no se pudo" would leave the operator unable to
    // tell a hierarchy refusal from a network blip.
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : 'No se pudo enviar el restablecimiento'),
  })

  function deactivateMember(id: string) {
    statusMutation.mutate({ id, status: 'disabled' })
    setRemoveTarget(null)
  }

  function reactivateMember(id: string) {
    statusMutation.mutate({ id, status: 'active' })
  }

  // Handing over the owner seat is a real, owner-only write. The current owner steps
  // down to admin in the same server transaction, so on success we refetch the session
  // (`auth.me`) to drop owner-only affordances at once; the JWT catches up on its next
  // refresh. The target gets owner power once THEIR token refreshes.
  const transferMutation = useMutation({
    mutationFn: (id: string) => usersApi.transferOwnership(id),
    onSuccess: async () => {
      await invalidateUsers()
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.me })
      setTransferTo('')
      setTransferConfirm(false)
      toast.success('Propiedad transferida')
    },
    onError: (error) => {
      setTransferConfirm(false)
      toast.error(error instanceof ApiError ? error.message : 'No se pudo transferir la propiedad')
    },
  })

  function transferOwnership() {
    if (!transferTo) return
    transferMutation.mutate(transferTo)
  }

  function addInvitedMember(values: {
    firstName: string
    lastName: string
    email: string
    role: Role
    teamMemberId?: string
  }) {
    // Ownership is never assignable on create; the dialog only offers admin/employee.
    if (values.role === 'owner') return
    createMutation.mutate({ ...values, role: values.role as AssignableUserRole })
  }

  return (
    <>
      <SectionHeader
        title="Miembros y roles"
        description="Quién tiene acceso al espacio de trabajo y con qué rol."
        actions={
          <Button variant="solid" color="primary" size="dense" onClick={() => setInviteOpen(true)}>
            <ICON.assignPerson className="size-4" aria-hidden />
            <span className="sm:hidden">Invitar</span>
            <span className="hidden sm:block">Invitar miembro</span>
          </Button>
        }
      />
      <PanelContent layout="stacked">
        <SettingGroup title="Miembros" description={`${members.length} personas con acceso.`}>
          <div className="flex flex-col gap-2">
            {members.map((member) => (
              // Each member is a STACKED block, not one wide row. Everything used to sit on a
              // single line — identity plus two selects plus two long text buttons — which at
              // this panel's width (~510px) squeezed the name and email down to two characters
              // ("Fl…", "ia…"). Identity gets the first line; the controls get their own,
              // indented to start under the name so they read as that person's, with a divider
              // separating one member from the next.
              <div
                key={member.id}
                className="flex flex-col gap-2 border-b border-alpha-subtle pb-3 last:border-b-0 last:pb-0"
              >
                <div className="flex items-center gap-3">
                <Avatar size="sm">
                  <AvatarFallback>{initials(member.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="type-button fg-default">{member.name}</span>
                    {member.isYou ? <span className="type-caption fg-subtle">(vos)</span> : null}
                    {member.status === 'disabled' ? <Badge variant="neutral">Sin acceso</Badge> : null}
                    {member.status === 'pending' ? <Badge variant="warning">Pendiente</Badge> : null}
                  </div>
                  <div className="truncate type-caption fg-subtle">{member.email}</div>
                </div>
                {member.isYou || !canGovern(member.role) ? (
                  <Badge variant="neutral">{ROLE_LABEL[member.role]}</Badge>
                ) : null}
                </div>
                {member.isYou || !canGovern(member.role) ? null : (
                  // Indented to start under the name: pl-11 = avatar (size-8) + the row gap.
                  // Stepped down on mobile, where 44px of dead width costs more than the cue.
                  <div className="flex flex-wrap items-center gap-2 pl-4 md:pl-11">
                    <Select
                      value={member.role}
                      onValueChange={(value) => setMemberRole(member.id, value as Role)}
                    >
                      <SelectTrigger className="w-32" aria-label={`Rol de ${member.name}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ASSIGNABLE_ROLES.map((assignable) => (
                          <SelectItem key={assignable} value={assignable}>
                            {ROLE_LABEL[assignable]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {role === 'owner' && customRoles.length > 0 ? (
                      <Select
                        value={
                          customRoles.some((r) => r.id === member.workspaceRoleId)
                            ? (member.workspaceRoleId as string)
                            : BASE_ROLE
                        }
                        onValueChange={(value) => assignRole(member, value)}
                      >
                        <SelectTrigger className="w-40" aria-label={`Rol personalizado de ${member.name}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={BASE_ROLE}>Rol base</SelectItem>
                          {customRoles.map((r) => (
                            <SelectItem key={r.id} value={r.id}>
                              {r.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : null}
                    {/* The two account actions were full-width text buttons ("Restablecer
                        contraseña", "Desactivar") — together wider than the selects. They move
                        into the overflow menu this codebase already uses for row actions, so
                        the line fits and the destructive one is one deliberate step away. */}
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        aria-label={`Acciones de ${member.name}`}
                        className={cn(
                          buttonVariants({ variant: 'outlined', color: 'primary' }),
                          'h-9 px-2',
                        )}
                      >
                        <AFFORDANCE.overflow className="size-4" aria-hidden />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          disabled={resetMutation.isPending}
                          onSelect={() => setResetTarget(member)}
                        >
                          Restablecer contraseña
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        {member.status === 'disabled' ? (
                          <DropdownMenuItem
                            disabled={statusMutation.isPending}
                            onSelect={() => reactivateMember(member.id)}
                          >
                            Reactivar
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem
                            disabled={statusMutation.isPending}
                            onSelect={() => setRemoveTarget(member)}
                          >
                            Desactivar
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )}
              </div>
            ))}
          </div>
        </SettingGroup>

        {role === 'owner' ? (
          <SettingGroup
            title="Transferencia de propiedad"
            description="Pasá el rol de Dueño a otra persona del equipo. Solo el Dueño puede hacerlo."
          >
            <Field label="Nuevo Dueño">
              <Select value={transferTo} onValueChange={setTransferTo}>
                <SelectTrigger className="w-full" aria-label="Nuevo Dueño">
                  <SelectValue placeholder="Elegí una persona" />
                </SelectTrigger>
                <SelectContent>
                  {others.map((member) => (
                    <SelectItem key={member.id} value={member.id}>
                      {member.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outlined"
                color="danger"
                size="dense"
                disabled={!transferTo}
                onClick={() => setTransferConfirm(true)}
              >
                Transferir propiedad
              </Button>
            </div>
          </SettingGroup>
        ) : null}
      </PanelContent>

      {removeTarget ? (
        <AlertDialog open onOpenChange={(open) => (open ? undefined : setRemoveTarget(null))}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Desactivar el acceso</AlertDialogTitle>
              <AlertDialogDescription>
                {removeTarget.name} no va a poder iniciar sesión y se cierran sus sesiones abiertas.
                Sus datos quedan intactos y podés reactivarlo cuando quieras.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setRemoveTarget(null)}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                color="danger"
                onClick={() => {
                  deactivateMember(removeTarget.id)
                  setRemoveTarget(null)
                }}
              >
                Desactivar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}

      {resetTarget ? (
        <AlertDialog open onOpenChange={(open) => (open ? undefined : setResetTarget(null))}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Restablecer contraseña</AlertDialogTitle>
              <AlertDialogDescription>
                Le enviamos a {resetTarget.name} ({resetTarget.email}) un link para que elija una
                contraseña nueva. Sus sesiones abiertas se cierran al hacerlo. Su contraseña actual
                sigue funcionando hasta entonces.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setResetTarget(null)}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                color="primary"
                disabled={resetMutation.isPending}
                onClick={() => resetMutation.mutate(resetTarget.id)}
              >
                Enviar link
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}

      {resetLink ? (
        <Dialog open onOpenChange={(open) => (open ? undefined : setResetLink(null))}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Enlace de restablecimiento</DialogTitle>
              <DialogDescription>
                El mail no salió (o está desactivado). Pasale este enlace a la persona para que elija
                una contraseña nueva.
              </DialogDescription>
            </DialogHeader>
            <Field label="Enlace">
              <Input value={resetLink} readOnly onFocus={(event) => event.currentTarget.select()} />
            </Field>
            <DialogFooter>
              <Button
                variant="outlined"
                color="primary"
                onClick={() => {
                  // Toast only once the clipboard write actually resolves — reporting
                  // success before it lands can lie when the write is denied/fails.
                  navigator.clipboard
                    .writeText(resetLink)
                    .then(() => toast.success('Enlace copiado'))
                    .catch(() => toast.error('No se pudo copiar el enlace'))
                }}
              >
                Copiar
              </Button>
              <DialogClose asChild>
                <Button variant="solid" color="primary">
                  Listo
                </Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}

      {transferConfirm ? (
        <AlertDialog open onOpenChange={(open) => (open ? undefined : setTransferConfirm(false))}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Transferir propiedad</AlertDialogTitle>
              <AlertDialogDescription>
                {members.find((member) => member.id === transferTo)?.name ?? 'La persona elegida'} pasará a ser Dueño
                y vos quedarás como Admin. Esta acción no se puede deshacer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setTransferConfirm(false)}>Cancelar</AlertDialogCancel>
              <AlertDialogAction color="danger" onClick={transferOwnership}>
                Transferir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}

      {inviteOpen ? (
        <InviteMemberDialog
          onClose={() => setInviteOpen(false)}
          onInvite={addInvitedMember}
          pending={createMutation.isPending}
          rosterOptions={rosterOptions}
        />
      ) : null}

      {inviteLink ? (
        <Dialog open onOpenChange={(open) => (open ? undefined : setInviteLink(null))}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Enlace de invitación</DialogTitle>
              <DialogDescription>
                El mail no salió (o está desactivado). Pasale este enlace a la persona para que cree
                su contraseña.
              </DialogDescription>
            </DialogHeader>
            <Field label="Enlace">
              <Input value={inviteLink} readOnly onFocus={(event) => event.currentTarget.select()} />
            </Field>
            <DialogFooter>
              <Button
                variant="outlined"
                color="primary"
                onClick={() => {
                  // Toast only once the clipboard write actually resolves (see the reset-link
                  // Copiar above) — a synchronous success toast can lie when the write fails.
                  navigator.clipboard
                    .writeText(inviteLink)
                    .then(() => toast.success('Enlace copiado'))
                    .catch(() => toast.error('No se pudo copiar el enlace'))
                }}
              >
                Copiar
              </Button>
              <DialogClose asChild>
                <Button variant="solid" color="primary">
                  Listo
                </Button>
              </DialogClose>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  )
}

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertTitle,
  Badge,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Skeleton,
  toast,
} from '@/app/components/components'
import { PanelContent, SectionHeader } from '@/app/components/templates'
import { rolesApi, type RoleDto } from '@/api/roles'
import { queryKeys } from '@/queries/keys'
import { RoleEditor } from './settings-roles-editor'
import { AREAS, materializeGrants, roleEditorState, type AccessLevel } from './settings-roles-data'

export function SettingsRoles() {
  const queryClient = useQueryClient()
  const rolesQuery = useQuery({ queryKey: queryKeys.roles.lists(), queryFn: rolesApi.list })

  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState<{
    name: string
    description: string
    access: Record<string, AccessLevel>
    money: Record<string, boolean>
  } | null>(null)
  const [expandedArea, setExpandedArea] = useState<string | null>(null)
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})
  const [deleteTarget, setDeleteTarget] = useState<RoleDto | null>(null)

  const roles = rolesQuery.data ?? []
  const editing = roles.find((role) => role.id === editingId) ?? null

  function openRole(role: RoleDto) {
    const state = roleEditorState(role)
    setEditingId(role.id)
    setDraft({
      name: role.name,
      description: role.description ?? '',
      access: state.access,
      money: state.money,
    })
    setOverrides(state.overrides)
    setExpandedArea(null)
  }

  function closeDialog() {
    setEditingId(null)
    setDraft(null)
    setExpandedArea(null)
    setOverrides({})
  }

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.roles.all })

  const createMutation = useMutation({
    mutationFn: rolesApi.create,
    onSuccess: async (role) => {
      await invalidate()
      toast.success('Rol creado')
      openRole(role)
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const saveMutation = useMutation({
    mutationFn: ({ id, ...input }: { id: string } & Parameters<typeof rolesApi.update>[1]) =>
      rolesApi.update(id, input),
    onSuccess: async () => {
      await invalidate()
      toast.success('Rol guardado')
      closeDialog()
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const deleteMutation = useMutation({
    mutationFn: ({ id, version }: { id: string; version: number }) => rolesApi.remove(id, version),
    onSuccess: async () => {
      await invalidate()
      toast.success('Rol eliminado')
      setDeleteTarget(null)
      closeDialog()
    },
    onError: (error: Error) => {
      toast.error(error.message)
      setDeleteTarget(null)
    },
  })

  function createRole() {
    createMutation.mutate({
      name: `Rol nuevo ${roles.filter((role) => !role.isSystem).length + 1}`,
      grants: [],
    })
  }

  function duplicateEditing() {
    if (!editing || !draft) return
    createMutation.mutate({
      name: `${draft.name} (copia)`,
      description: draft.description || undefined,
      grants: materializeGrants(draft.access, draft.money, overrides),
    })
  }

  function saveEditing() {
    if (!editing || !draft) return
    saveMutation.mutate({
      id: editing.id,
      name: draft.name,
      description: draft.description || null,
      grants: materializeGrants(draft.access, draft.money, overrides),
      version: editing.version,
    })
  }

  function changeAreaLevel(areaId: string, next: AccessLevel) {
    if (!draft) return
    setDraft({ ...draft, access: { ...draft.access, [areaId]: next } })
    const area = AREAS.find((candidate) => candidate.id === areaId)
    if (area) {
      setOverrides((prev) => {
        const cleared = { ...prev }
        for (const permission of area.permissions) delete cleared[permission.key]
        return cleared
      })
    }
    setExpandedArea(next === 'none' ? null : areaId)
  }

  return (
    <>
      <SectionHeader
        title="Roles y permisos"
        description="Qué puede ver y hacer cada rol. Para asignarle un rol a una persona, andá a Miembros y roles."
        actions={
          <Button
            variant="solid"
            color="primary"
            size="dense"
            onClick={createRole}
            disabled={createMutation.isPending}
          >
            Crear rol
          </Button>
        }
      />
      <PanelContent layout="stacked">
        {rolesQuery.isError ? (
          <Alert variant="danger">
            <AlertTitle>No pudimos cargar los roles</AlertTitle>
            <AlertDescription>
              Revisá tu conexión y volvé a intentar.{' '}
              <Button
                variant="transparent"
                color="primary"
                size="dense"
                onClick={() => rolesQuery.refetch()}
              >
                Reintentar
              </Button>
            </AlertDescription>
          </Alert>
        ) : rolesQuery.isPending ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-20" />
            <Skeleton className="h-20" />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {roles.map((role) => (
              <Card
                key={role.id}
                interactive
                size="compact"
                onClick={() => openRole(role)}
                className="flex flex-col gap-1 p-4 text-left"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="type-body-2 fg-default">{role.name}</span>
                  {role.isSystem ? (
                    <Badge variant="neutral" shape="pill">
                      Del sistema
                    </Badge>
                  ) : null}
                </span>
                <span className="type-caption fg-subtle">
                  {role.description || 'Sin descripción todavía.'}
                </span>
                <span className="type-caption fg-subtle">
                  {role.memberCount === 1 ? '1 persona' : `${role.memberCount} personas`}
                </span>
              </Card>
            ))}
          </div>
        )}
      </PanelContent>

      <Dialog open={editing !== null} onOpenChange={(open) => (open ? null : closeDialog())}>
        <DialogContent className="sm:max-w-3xl">
          {editing && draft ? (
            <>
              <DialogHeader>
                <DialogTitle>{draft.name || 'Rol nuevo'}</DialogTitle>
                <DialogDescription>
                  {editing.isSystem
                    ? 'Este rol viene con el producto. Podés mirar todo lo que permite, pero para cambiarlo tenés que duplicarlo.'
                    : 'Definí qué puede ver y hacer quien tenga este rol.'}
                </DialogDescription>
              </DialogHeader>

              <RoleEditor
                role={{ ...draft, isSystem: editing.isSystem }}
                expandedArea={expandedArea}
                overrides={overrides}
                onChange={(patch) => setDraft({ ...draft, ...patch })}
                onAreaLevelChange={changeAreaLevel}
                onToggleArea={(areaId) =>
                  setExpandedArea((prev) => (prev === areaId ? null : areaId))
                }
                onTogglePermission={(key, next) =>
                  setOverrides((prev) => ({ ...prev, [key]: next }))
                }
              />

              <DialogFooter className="sm:justify-between">
                {editing.isSystem ? (
                  <span />
                ) : (
                  <Button
                    variant="transparent"
                    color="danger"
                    size="dense"
                    onClick={() => setDeleteTarget(editing)}
                  >
                    Eliminar rol
                  </Button>
                )}
                <div className="flex flex-col-reverse gap-2 sm:flex-row">
                  <Button
                    variant="outlined"
                    color="primary"
                    size="dense"
                    onClick={duplicateEditing}
                    disabled={createMutation.isPending}
                  >
                    {editing.isSystem ? 'Duplicar para editar' : 'Duplicar este rol'}
                  </Button>
                  <Button
                    variant="solid"
                    color="primary"
                    size="dense"
                    onClick={saveEditing}
                    disabled={editing.isSystem || saveMutation.isPending}
                  >
                    Guardar cambios
                  </Button>
                </div>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      {deleteTarget ? (
        <AlertDialog open onOpenChange={(open) => (open ? undefined : setDeleteTarget(null))}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminar el rol</AlertDialogTitle>
              <AlertDialogDescription>
                Se elimina {deleteTarget.name} y sus permisos. Si alguien lo tiene asignado, el
                sistema no te va a dejar hasta que muevas a esa gente a otro rol.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setDeleteTarget(null)}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                color="danger"
                onClick={() =>
                  deleteMutation.mutate({ id: deleteTarget.id, version: deleteTarget.version })
                }
              >
                Eliminar rol
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </>
  )
}

import { useMemo, useState } from 'react'
import type { FilterFn } from '@tanstack/react-table'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Input,
  toast,
} from '@/app/components/components'
import { DataTable } from '@/app/components/patterns'
import { useTreasury } from './treasury-data'
import type { CommittedItem } from './treasury-mock-data'
import { commitmentSearchText } from './treasury-view'
import { committedItemColumns, type CommitmentRowActions } from './cashflow-commitment-columns'
import { CashflowCommitmentDialog } from './cashflow-commitment-dialog'
import { formatMoney } from './cobranza-format'

const globalFilterFn: FilterFn<CommittedItem> = (row, _columnId, value) =>
  commitmentSearchText(row.original).includes(String(value).toLowerCase())

export function CashflowRegister() {
  const { commitments, applyCommitment, removeCommitment } = useTreasury()
  const [editTarget, setEditTarget] = useState<CommittedItem | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<CommittedItem | null>(null)

  const rowActions = useMemo<CommitmentRowActions>(
    () => ({
      onEdit: (item) => setEditTarget(item),
      onDelete: (item) => setDeleteTarget(item),
    }),
    [],
  )
  const columns = useMemo(() => committedItemColumns(rowActions), [rowActions])

  async function confirmDelete() {
    if (!deleteTarget) return
    const target = deleteTarget
    setDeleteTarget(null)
    try {
      await removeCommitment(target.id)
      toast.success('Compromiso eliminado')
    } catch {
      toast.error('No se pudo eliminar el compromiso')
    }
  }

  return (
    <>
      <div className="px-4 md:px-6 lg:px-8 desktop:px-10">
        <DataTable
          columns={columns}
          data={commitments}
          pageSize={20}
          pinActionsColumn
          globalFilterFn={globalFilterFn}
          getRowId={(item) => item.id}
          toolbar={(table) => (
            <div className="pb-3">
              <Input
                value={(table.getState().globalFilter as string) ?? ''}
                onChange={(event) => table.setGlobalFilter(event.target.value)}
                placeholder="Buscar compromiso"
                aria-label="Buscar compromiso"
                className="h-9 w-full max-w-xs"
              />
            </div>
          )}
        />
      </div>

      {editTarget ? (
        <CashflowCommitmentDialog
          item={editTarget}
          onSave={applyCommitment}
          onClose={() => setEditTarget(null)}
        />
      ) : null}

      {deleteTarget ? (
        <AlertDialog open onOpenChange={(open) => (open ? undefined : setDeleteTarget(null))}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminar compromiso</AlertDialogTitle>
              <AlertDialogDescription>
                El compromiso "{deleteTarget.description}" por{' '}
                {formatMoney(deleteTarget.amount, deleteTarget.currency)} se quitará de la
                proyección. Esta acción no se puede deshacer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setDeleteTarget(null)}>Volver</AlertDialogCancel>
              <AlertDialogAction color="danger" onClick={confirmDelete}>
                Eliminar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </>
  )
}

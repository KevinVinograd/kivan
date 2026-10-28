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

/**
 * Compromisos tab — the committed-items register. A DataTable over the treasury store's
 * commitments: edit (via the shared dialog) and delete behind a confirm. The
 * active/disabled toggle lives inside the edit dialog. Derived items (auto-seeded from
 * recurring sources) and manual ones share the table; editing or deleting mutates the
 * in-memory store.
 *
 * ADDING is deliberately NOT here. The page-header action owns it (`cashflow-page.tsx`,
 * `headerActions[0]`), and it is the only add affordance on this surface: it renders outside
 * the <Tabs>, so it is reachable from every tab, at every breakpoint, and while the register
 * is empty — none of which the toolbar button it replaced could claim.
 *
 * Nothing is lost by not creating here: the header's dialog and this table read the same
 * react-query cache (`queryKeys.treasury.commitments`), so a commitment created from the
 * header lands in this table immediately. Do not add a second button back.
 */
export function CashflowRegister() {
  // No `addCommitment`: this component edits and deletes, it does not create.
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
            // Only the search field lives here now, so the flex row is gone: the wrapper
            // survives solely for the bottom spacing (which cannot move onto the Input, where
            // it would pad the inside of the field instead of the gap below it).
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
                {/* The row's own lane, matching the Monto column this branch made lane-aware.
                    A destructive confirmation quoting a different figure from the row it is
                    about is the worst place for the two to disagree. */}
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

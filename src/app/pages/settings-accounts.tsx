import { useState } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  buttonVariants,
  toast,
} from '@/app/components/components'
import { PanelContent, SectionHeader } from '@/app/components/templates'
import { DatePicker } from '@/app/components/patterns'
import { AFFORDANCE, ICON } from '@/app/lib/icon-registry'
import { cn } from '@/app/lib/utils'
import { useRole } from '@/app/lib/use-role'
import { useTreasury } from './treasury-data'
import { Field, SettingGroup } from './settings-fields'
import type { Account } from './treasury-mock-data'
import { CURRENCIES, laneAmount } from './treasury-position'
import {
  ACCOUNT_TYPE_LABEL,
  formatLaneAmount,
  LANE_LABEL,
  PARTNER_LABEL,
} from './treasury-position-view'
import { CashflowAccountDialog } from './cashflow-account-dialog'
import { SettingsAccountsError, SettingsAccountsLoading } from './settings-states'

function AccountRow({
  account,
  onEdit,
  onDelete,
}: {
  account: Account
  onEdit: (account: Account) => void
  onDelete: (account: Account) => void
}) {
  return (
    <TableRow className={cn(!account.isActive && 'opacity-60')}>
      <TableCell className="align-top">
        <div className="flex flex-col gap-0.5 whitespace-normal">
          <span className="type-body-2 fg-default">{account.name}</span>
          <span className="flex flex-wrap items-center gap-2 type-caption fg-subtle">
            {PARTNER_LABEL[account.partner]} · {ACCOUNT_TYPE_LABEL[account.type]}
            {account.isReserve ? <Badge variant="neutral">Reserva</Badge> : null}
          </span>
          {account.note ? <span className="type-caption fg-subtle">{account.note}</span> : null}
        </div>
      </TableCell>
      {CURRENCIES.map((currency) => {
        const present = account.balances[currency] != null
        return (
          <TableCell key={currency} className="text-right align-top tabular-nums fg-default">
            {present ? (
              formatLaneAmount(laneAmount(account.balances, currency), currency)
            ) : (
              <span className="fg-subtle">-</span>
            )}
          </TableCell>
        )
      })}
      <TableCell className="align-top">
        <div className="flex justify-end">
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`Acciones de ${account.name}`}
              className={cn(
                buttonVariants({ variant: 'transparent', color: 'primary' }),
                'size-8 shrink-0',
              )}
            >
              <AFFORDANCE.overflow className="size-4" aria-hidden />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => onEdit(account)}>
                <ICON.edit aria-hidden />
                Editar
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => onDelete(account)}>
                <ICON.delete aria-hidden />
                Eliminar
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>
    </TableRow>
  )
}

export function SettingsAccounts() {
  const { account, accounts, updateAccount, addAccount, applyAccount, removeAccount, isFetching, isError, refetch } =
    useTreasury()
  const { canDo } = useRole()
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Account | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Account | null>(null)

  async function confirmDelete() {
    if (!deleteTarget) return
    const target = deleteTarget
    setDeleteTarget(null)
    try {
      await removeAccount(target.id)
      toast.success('Cuenta eliminada')
    } catch {
      toast.error('No se pudo eliminar la cuenta')
    }
  }

  if (isFetching) {
    return (
      <>
        <SectionHeader
          title="Cashflow"
          description="Cuentas de tesorería y fecha de la posición que ancla el cashflow."
        />
        <PanelContent layout="stacked">
          <SettingsAccountsLoading />
        </PanelContent>
      </>
    )
  }

  if (isError) {
    return (
      <>
        <SectionHeader
          title="Cashflow"
          description="Cuentas de tesorería y fecha de la posición que ancla el cashflow."
        />
        <PanelContent layout="stacked">
          <SettingsAccountsError onRetry={refetch} />
        </PanelContent>
      </>
    )
  }

  return (
    <>
      <SectionHeader
        title="Cashflow"
        description="Cuentas de tesorería y fecha de la posición que ancla el cashflow."
        actions={
          canDo('treasury.account.create') ? (
            <Button variant="solid" color="primary" size="dense" onClick={() => setCreateOpen(true)}>
              Agregar cuenta
            </Button>
          ) : undefined
        }
      />
      <PanelContent layout="stacked">
        <SettingGroup
          title="Fecha de la posición"
          description="El día al que corresponde la foto de saldos y el inicio de la proyección."
        >
          <Field label="Fecha">
            <DatePicker
              value={account.openingBalanceDate}
              onChange={(next) => updateAccount({ ...account, openingBalanceDate: next })}
              required aria-label="Fecha de la posición"
            />
          </Field>
        </SettingGroup>

        <SettingGroup
          title="Cuentas"
          description="Saldos por moneda (ARS / USD). Las cuentas de reserva suman a Finanzas Hold."
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cuenta</TableHead>
                {CURRENCIES.map((currency) => (
                  <TableHead key={currency} className="text-right">
                    {LANE_LABEL[currency]}
                  </TableHead>
                ))}
                <TableHead>
                  <span className="sr-only">Acciones</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {accounts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={2 + CURRENCIES.length} className="type-caption fg-subtle">
                    No hay cuentas cargadas. Agregá la primera.
                  </TableCell>
                </TableRow>
              ) : (
                accounts.map((item) => (
                  <AccountRow
                    key={item.id}
                    account={item}
                    onEdit={setEditTarget}
                    onDelete={setDeleteTarget}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </SettingGroup>
      </PanelContent>

      {createOpen ? (
        <CashflowAccountDialog onCreate={addAccount} onClose={() => setCreateOpen(false)} />
      ) : null}

      {editTarget ? (
        <CashflowAccountDialog
          account={editTarget}
          onSave={applyAccount}
          onClose={() => setEditTarget(null)}
        />
      ) : null}

      {deleteTarget ? (
        <AlertDialog open onOpenChange={(open) => (open ? undefined : setDeleteTarget(null))}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminar cuenta</AlertDialogTitle>
              <AlertDialogDescription>
                La cuenta "{deleteTarget.name}" se quitará de la posición. Esta acción no se puede
                deshacer.
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

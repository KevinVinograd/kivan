import { test, expect, type Page } from '@playwright/test'

import { applyRole } from './fixtures/role'
import { stubRoute } from './fixtures/api-mock'

const MEMBER = { id: 'tm-mica', name: 'Micaela Duarte' }

function payout(statementStatus: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'po-1',
    teamMemberId: MEMBER.id,
    period: '2026-07-01',
    baseAmountMinor: '80000000',
    productionsAmountMinor: '0',
    viaticsAmountMinor: '0',
    adjustmentsTotalMinor: '0',
    totalAmountMinor: '80000000',
    paidAmountMinor: '0',
    outstandingMinor: '80000000',
    hoursTotal: null,
    hourlyRateMinor: null,
    statementStatus,
    bankId: null,
    bankProfile: { bankName: 'Galicia', accountHolder: 'Micaela Duarte', cbuOrCvu: '0000003100000000000000' },
    dueDate: null,
    approvedAt: null,
    approvedByUserId: null,
    version: 0,
    createdAt: '2026-07-01T00:00:00.000Z',
    adjustments: [],
    ...overrides,
  }
}

async function openTeam(page: Page) {
  await page.goto('/team', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('main')).toBeVisible()
}

const memberRow = (page: Page) => page.getByRole('row').filter({ hasText: MEMBER.name })

async function openRowMenu(page: Page) {
  await memberRow(page).getByRole('button', { name: 'Acciones de la persona' }).click()
}

test('a failed approval keeps the confirmation open and never toasts success', async ({ page }) => {
  await applyRole(page, 'owner', { bundle: { payouts: [payout('draft')] } })
  await stubRoute(page, '/payout-statements/*/approve', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'boom' }) }),
  )

  await openTeam(page)
  await openRowMenu(page)
  await page.getByRole('menuitem', { name: 'Aprobar pago' }).click()

  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Aprobar', exact: true }).click()

  await expect(page.getByText('No se pudo aprobar el pago')).toBeVisible()
  await expect(dialog).toBeVisible()
  expect(await page.getByText('Pago aprobado').count()).toBe(0)
})

test('a successful approval toasts, closes, and the badge comes back from the server', async ({ page }) => {
  await applyRole(page, 'owner', { bundle: { payouts: [payout('draft')] } })

  await stubRoute(page, '/payout-statements/*/approve', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payout('approved')) }),
  )

  await openTeam(page)
  await expect(memberRow(page).getByText('Pendiente', { exact: true })).toBeVisible()

  await openRowMenu(page)
  await page.getByRole('menuitem', { name: 'Aprobar pago' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Aprobar', exact: true }).click()

  await expect(page.getByText('Pago aprobado')).toBeVisible()
  await expect(page.getByRole('alertdialog')).not.toBeVisible()
  await expect(memberRow(page).getByText('Aprobado', { exact: true })).toBeVisible()
})

test('the offered step is the one the server accepts next', async ({ page }) => {
  await applyRole(page, 'owner', { bundle: { payouts: [payout('approved')] } })

  await openTeam(page)
  await openRowMenu(page)

  await expect(page.getByRole('menuitem', { name: 'Pagar', exact: true })).toBeVisible()
  expect(await page.getByRole('menuitem', { name: 'Aprobar pago' }).count()).toBe(0)
})

test('a dispatched statement offers confirmation, and confirming persists', async ({ page }) => {
  await applyRole(page, 'owner', { bundle: { payouts: [payout('dispatched')] } })
  await stubRoute(page, '/payout-statements/*/confirm', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payout('confirmed', { paidAmountMinor: '80000000', outstandingMinor: '0' })),
    }),
  )

  await openTeam(page)
  await expect(memberRow(page).getByText('Pago en proceso', { exact: true })).toBeVisible()

  await openRowMenu(page)
  await page.getByRole('menuitem', { name: 'Confirmar pagado' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Confirmar pagado' }).click()

  await expect(page.getByText('Pago marcado como pagado')).toBeVisible()
  await expect(memberRow(page).getByText('Pagado', { exact: true })).toBeVisible()
})

test('a short-paid confirmed statement reads as a difference, not as paid', async ({ page }) => {
  await applyRole(page, 'owner', {
    bundle: {
      payouts: [payout('confirmed', { paidAmountMinor: '50000000', outstandingMinor: '30000000' })],
    },
  })

  await openTeam(page)
  await expect(memberRow(page).getByText('Con diferencia', { exact: true })).toBeVisible()
  expect(await memberRow(page).getByText('Pagado', { exact: true }).count()).toBe(0)

  await openRowMenu(page)
  await expect(page.getByRole('menuitem', { name: 'Pagar diferencia' })).toBeVisible()
})

test('a member with no plan for the month says so instead of showing zero', async ({ page }) => {
  await applyRole(page, 'owner', { bundle: { payouts: [] } })

  await openTeam(page)
  const row = memberRow(page)
  await expect(row).toBeVisible()

  expect(await row.getByText('$', { exact: false }).count()).toBe(0)

  await openRowMenu(page)
  await expect(page.getByRole('menuitem', { name: 'Sin plan del mes' })).toBeDisabled()
})

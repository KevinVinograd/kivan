import { test, expect, type Page } from '@playwright/test'

import { applyRole } from './fixtures/role'
import { stubJson, stubRoute } from './fixtures/api-mock'

const MEMBER = { id: 'tm-mica', name: 'Micaela Duarte', role: 'Contadora' }
const MEMBER_TWO = { id: 'tm-bruno', name: 'Bruno Sosa', role: 'Analista' }

function payout(statementStatus: string) {
  return {
    id: 'po-1',
    teamMemberId: MEMBER.id,
    period: '2026-06',
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
    createdAt: '2026-06-01T00:00:00.000Z',
    adjustments: [],
  }
}

async function openTeamSection(page: Page) {
  await page.goto('/operacion-mensual', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('main')).toBeVisible()
  await page.getByRole('button', { name: /Equipo y pagos/ }).click()
}

async function openRowMenu(page: Page) {
  await page.getByRole('button', { name: 'Acciones del pago' }).first().click()
}

const payoutRow = (page: Page) => page.getByRole('row').filter({ hasText: MEMBER.name })

test('a failed approval keeps the confirmation open and never toasts success', async ({ page }) => {
  await applyRole(page, 'owner', { bundle: { payouts: [payout('draft')], members: [MEMBER] } })

  await stubRoute(page, '/payout-statements/*/approve', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'boom' }) }),
  )

  await openTeamSection(page)
  await openRowMenu(page)
  await page.getByRole('menuitem', { name: 'Aprobar' }).click()

  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Aprobar' }).click()

  await expect(page.getByText('No se pudo guardar el cambio')).toBeVisible()

  await expect(dialog).toBeVisible()
  expect(await page.getByText('Cuenta corriente aprobada').count()).toBe(0)
})

test('a successful approval toasts, closes, and the badge comes back from the server', async ({ page }) => {
  await applyRole(page, 'owner', { bundle: { payouts: [payout('draft')], members: [MEMBER] } })

  let status = 'draft'
  await stubRoute(page, '/months/*/plan', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        period: '2026-06',
        status: 'draft',
        checklist: {},
        receivables: [],
        payouts: [payout(status)],
        productions: [],
        expenses: [],
        alerts: [],
        monotributo: [],
        members: [MEMBER],
      }),
    }),
  )
  await stubRoute(page, '/payout-statements/*/approve', (route) => {
    status = 'approved'
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payout('approved')),
    })
  })

  await openTeamSection(page)
  await expect(payoutRow(page).getByText('Sin aprobar', { exact: true })).toBeVisible()

  await openRowMenu(page)
  await page.getByRole('menuitem', { name: 'Aprobar' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Aprobar' }).click()

  await expect(page.getByText('Cuenta corriente aprobada')).toBeVisible()
  await expect(page.getByRole('alertdialog')).not.toBeVisible()
  await expect(payoutRow(page).getByText('Aprobada', { exact: true })).toBeVisible()
})

test('the badge follows the reloaded bundle, not the click', async ({ page }) => {
  await applyRole(page, 'owner', { bundle: { payouts: [payout('draft')], members: [MEMBER] } })

  await stubRoute(page, '/payout-statements/*/approve', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payout('approved')),
    }),
  )

  await openTeamSection(page)
  await openRowMenu(page)
  await page.getByRole('menuitem', { name: 'Aprobar' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: 'Aprobar' }).click()

  await expect(page.getByText('Cuenta corriente aprobada')).toBeVisible()
  await expect(payoutRow(page).getByText('Sin aprobar', { exact: true })).toBeVisible()
  expect(await payoutRow(page).getByText('Aprobada', { exact: true }).count()).toBe(0)
})

test('the row offers the one transition the server accepts next', async ({ page }) => {
  await applyRole(page, 'owner', { bundle: { payouts: [payout('approved')], members: [MEMBER] } })

  await openTeamSection(page)
  await openRowMenu(page)

  await expect(page.getByRole('menuitem', { name: 'Enviar' })).toBeVisible()
  expect(await page.getByRole('menuitem', { name: 'Aprobar' }).count()).toBe(0)
})

test('a confirmed statement offers no transition at all', async ({ page }) => {
  await applyRole(page, 'owner', { bundle: { payouts: [payout('confirmed')], members: [MEMBER] } })

  await openTeamSection(page)

  await expect(payoutRow(page).getByText('Confirmada', { exact: true })).toBeVisible()

  await openRowMenu(page)
  await expect(page.getByRole('menuitem', { name: 'Ver detalle' })).toBeVisible()
  for (const label of ['Aprobar', 'Enviar', 'Confirmar']) {
    expect(await page.getByRole('menuitem', { name: label }).count()).toBe(0)
  }
})

test('the bulk approval reports a partial failure as partial, not as success', async ({ page }) => {
  const second = { ...payout('draft'), id: 'po-2', teamMemberId: MEMBER_TWO.id }
  await applyRole(page, 'owner', {
    bundle: { payouts: [payout('draft'), second], members: [MEMBER, MEMBER_TWO] },
  })

  await stubRoute(page, '/payout-statements/*/approve', (route) => {
    const failing = route.request().url().includes('po-2')
    return route.fulfill({
      status: failing ? 500 : 200,
      contentType: 'application/json',
      body: failing ? '{"message":"boom"}' : JSON.stringify(payout('approved')),
    })
  })

  await openTeamSection(page)
  await page.getByRole('button', { name: /Aprobar cuentas corrientes/ }).click()

  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText(/2 cuentas corrientes/)).toBeVisible()
  await dialog.getByRole('button', { name: 'Aprobar 2' }).click()

  await expect(page.getByText('1 de 2 cuentas corrientes aprobadas')).toBeVisible()
  expect(await page.getByText('2 cuentas corrientes aprobadas', { exact: true }).count()).toBe(0)
})

test("the close dialog shows the server's blocker instead of promising a close it cannot make", async ({
  page,
}) => {
  await applyRole(page, 'owner', { bundle: { payouts: [payout('draft')], members: [MEMBER] } })

  await stubJson(page, '/months/*/close-blockers', [
    { code: 'unapproved_payouts', message: 'Payout statements still in draft', count: 1 },
  ])

  await page.goto('/operacion-mensual', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('main')).toBeVisible()
  await page.getByRole('button', { name: /Cerrar mes/ }).first().click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Cuentas corrientes sin aprobar')).toBeVisible()
  await expect(dialog.getByText('Micaela Duarte')).toBeVisible()
})

import { test, expect, type Page } from '@playwright/test'

import { applyRole } from './fixtures/role'
import { stubJson, stubRoute } from './fixtures/api-mock'

/**
 * The payout statement lifecycle is a real write, and a failed one must not look green.
 *
 * Before this, `/operacion-mensual` offered "Generar cuenta corriente", which flipped a
 * session-only status map and persisted nothing: the badge moved, the next reload put it
 * back, and the server kept refusing the month close on `unapproved_payouts` with no UI
 * path to clear it. `POST /payout-statements/:id/approve` had existed, guarded and
 * state-machine-correct, with zero callers.
 *
 * What only a browser can prove (the structural check proves the `await`, not this):
 *  - a 500 leaves the confirmation standing and never renders the success toast
 *  - a 200 closes it and the badge re-renders from the RELOADED server row, not from
 *    local state (the stub below flips its own state, so a front that still faked the
 *    transition would show the same badge for the wrong reason and fail the 500 case)
 *  - the action offered is the one the server accepts next, and an already-confirmed
 *    statement offers none
 *
 * The success toast is asserted with `.count()` AFTER the error toast has rendered, never
 * with `not.toBeVisible()`: Playwright auto-waits, so a negative visibility assertion run
 * while the request is still in flight passes for the wrong reason.
 */

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
    // Required by PayoutStatementSchema. null = NOT RECORDED, which is what
    // every statement predating the attribution model carries.
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

/** Open the Equipo y pagos section (it ships collapsed, so its table mounts on expand). */
async function openTeamSection(page: Page) {
  await page.goto('/operacion-mensual', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('main')).toBeVisible()
  await page.getByRole('button', { name: /Equipo y pagos/ }).click()
}

async function openRowMenu(page: Page) {
  await page.getByRole('button', { name: 'Acciones del pago' }).first().click()
}

/**
 * The payout's table row. Every badge assertion scopes through this.
 *
 * `page.getByText('Aprobada')` would NOT do: getByText matches a case-insensitive
 * SUBSTRING by default, so the success toast ("Cuenta corriente aprobada") satisfies it
 * on its own — the assertion then passes with the badge still reading "Sin aprobar",
 * which is precisely the regression it exists to catch. ("Aprobada" is also a production
 * status label elsewhere on this page.)
 */
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

  // Wait for the failure to surface: by the time it renders, the write has resolved and
  // the handler has had its chance to lie.
  await expect(page.getByText('No se pudo guardar el cambio')).toBeVisible()

  await expect(dialog).toBeVisible()
  expect(await page.getByText('Cuenta corriente aprobada').count()).toBe(0)
})

test('a successful approval toasts, closes, and the badge comes back from the server', async ({ page }) => {
  await applyRole(page, 'owner', { bundle: { payouts: [payout('draft')], members: [MEMBER] } })

  // Stateful on purpose: the badge must change because the RELOADED bundle says so. A
  // front that flipped a local status would pass a static stub and still be lying.
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

  // The discriminating case, and the only shape that can tell a server-sourced badge from
  // a locally-flipped one: the write SUCCEEDS, but the reloaded bundle still says `draft`.
  // A UI that advances its own status map renders "Aprobada" here and fails. This is what
  // the old "Generar cuenta corriente" did on every click, forever, with no write at all.
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

  // Wait for the write to resolve and the reload to land before reading the row, so the
  // assertion cannot pass merely because nothing has happened yet.
  await expect(page.getByText('Cuenta corriente aprobada')).toBeVisible()
  await expect(payoutRow(page).getByText('Sin aprobar', { exact: true })).toBeVisible()
  expect(await payoutRow(page).getByText('Aprobada', { exact: true }).count()).toBe(0)
})

test('the row offers the one transition the server accepts next', async ({ page }) => {
  await applyRole(page, 'owner', { bundle: { payouts: [payout('approved')], members: [MEMBER] } })

  await openTeamSection(page)
  await openRowMenu(page)

  // An approved statement dispatches next: offering "Aprobar" again would 409.
  await expect(page.getByRole('menuitem', { name: 'Enviar' })).toBeVisible()
  expect(await page.getByRole('menuitem', { name: 'Aprobar' }).count()).toBe(0)
})

test('a confirmed statement offers no transition at all', async ({ page }) => {
  await applyRole(page, 'owner', { bundle: { payouts: [payout('confirmed')], members: [MEMBER] } })

  await openTeamSection(page)

  // The badge distinguishes it from a merely dispatched statement. Asserting this here
  // is what stops the test from passing vacuously: absence-only assertions would also
  // hold against a UI that never offered these actions in the first place.
  await expect(payoutRow(page).getByText('Confirmada', { exact: true })).toBeVisible()

  await openRowMenu(page)
  // The menu still opens (Ver detalle, Registrar pago, …); the lifecycle item is gone.
  await expect(page.getByRole('menuitem', { name: 'Ver detalle' })).toBeVisible()
  for (const label of ['Aprobar', 'Enviar', 'Confirmar']) {
    expect(await page.getByRole('menuitem', { name: label }).count()).toBe(0)
  }
})

test('the bulk approval reports a partial failure as partial, not as success', async ({ page }) => {
  // The widest-blast-radius action on the screen: it used to loop a session-only setter
  // over the whole roster, so every statement appeared produced at once and none was.
  const second = { ...payout('draft'), id: 'po-2', teamMemberId: MEMBER_TWO.id }
  await applyRole(page, 'owner', {
    bundle: { payouts: [payout('draft'), second], members: [MEMBER, MEMBER_TWO] },
  })

  // One of the two writes fails. The tally must survive that, rather than the whole
  // batch reporting success (or one error toast per row).
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
  // The confirmation states the count before anything is written.
  await expect(dialog.getByText(/2 cuentas corrientes/)).toBeVisible()
  await dialog.getByRole('button', { name: 'Aprobar 2' }).click()

  await expect(page.getByText('1 de 2 cuentas corrientes aprobadas')).toBeVisible()
  expect(await page.getByText('2 cuentas corrientes aprobadas', { exact: true }).count()).toBe(0)
})

test("the close dialog shows the server's blocker instead of promising a close it cannot make", async ({
  page,
}) => {
  await applyRole(page, 'owner', { bundle: { payouts: [payout('draft')], members: [MEMBER] } })

  // What the server actually refuses on. The front computes seven other validations and
  // none of them is this one, so before the merge the dialog said "sin validaciones
  // pendientes" and the close 409'd with nothing on screen explaining it.
  await stubJson(page, '/months/*/close-blockers', [
    { code: 'unapproved_payouts', message: 'Payout statements still in draft', count: 1 },
  ])

  await page.goto('/operacion-mensual', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('main')).toBeVisible()
  await page.getByRole('button', { name: /Cerrar mes/ }).first().click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Cuentas corrientes sin aprobar')).toBeVisible()
  // Named, not counted: the blocker lists who is missing.
  await expect(dialog.getByText('Micaela Duarte')).toBeVisible()
})

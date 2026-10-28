import { test, expect } from '@playwright/test'

import { applyRole } from './fixtures/role'
import { stubRoute } from './fixtures/api-mock'

/**
 * The commitment dialog's counterparty picker, driven the way an operator drives it.
 *
 * This spec exists because of a specific miss. The link feature was verified against a
 * real stack by creating the commitment WITH CURL and then reading the projection: the
 * engine and the register were both confirmed correct, and the dialog was never opened.
 * It asked the API for `limit=200`, the API caps list reads at 100, so every option fetch
 * was a 400 — and because a failed fetch is treated as "nothing to require", the form
 * saved an unlinked commitment with nothing on screen to notice. The whole feature was
 * inert for the two categories that matter, and every check upstream was green.
 *
 * So the assertions here are about the REQUEST and the WRITE, not about pixels: what the
 * picker asks the API for, and what the dialog ultimately sends.
 */

const json = (body: unknown, status = 200) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
})

/** The API's real cap: `listClientsQuerySchema` / `listTeamQuerySchema` both `.max(100)`. */
const API_LIST_LIMIT = 100

async function openCommitmentDialog(page: import('@playwright/test').Page) {
  await page.goto('/cashflow', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('main')).toBeVisible()
  await page.getByRole('tab', { name: 'Compromisos' }).click()
  // `Agregar` is a launcher MENU, not a direct action: it opens four create dialogs and
  // the commitment is one entry in it.
  await page.getByRole('button', { name: 'Agregar' }).first().click()
  await page.getByRole('menuitem', { name: /Compromiso/ }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  return dialog
}

test('the counterparty picker asks the API for a page it will actually serve', async ({ page }) => {
  await applyRole(page, 'owner')

  // The shared fixture already refuses a limit the backend would refuse (`capped` in
  // `api-mock.ts`), so an over-large page fails as a load error below rather than being
  // quietly answered. This only records the URL to assert the number itself.
  let listUrl = ''
  page.on('request', (req) => {
    if (req.url().includes('/clients?')) listUrl = req.url()
  })

  const dialog = await openCommitmentDialog(page)
  await dialog.getByLabel('Tipo').click()
  await page.getByRole('option', { name: 'Ingreso' }).click()
  await dialog.getByLabel('Categoría').click()
  await page.getByRole('option', { name: 'Abonos' }).click()

  // The picker rendered, and it rendered a LIST rather than a load failure.
  const picker = dialog.getByLabel('Cliente')
  await expect(picker).toBeEnabled()
  await expect(dialog.getByText('No se pudo cargar la lista de opciones')).toHaveCount(0)

  expect(listUrl).not.toBe('')
  expect(Number(new URL(listUrl).searchParams.get('limit'))).toBeLessThanOrEqual(API_LIST_LIMIT)
})

test('picking a counterparty sends BOTH halves of the link', async ({ page }) => {
  await applyRole(page, 'owner')

  let postBody: Record<string, unknown> | null = null
  await stubRoute(page, '/treasury/commitments', (route) => {
    const req = route.request()
    if (req.method() !== 'POST') return route.fallback()
    postBody = req.postDataJSON() as Record<string, unknown>
    return route.fulfill(
      json({
        id: 'cmt-new',
        description: postBody.description,
        direction: postBody.direction,
        amountMinor: postBody.amountMinor,
        currency: 'ARS',
        category: postBody.category,
        recurrence: postBody.recurrence,
        startDate: postBody.startDate,
        endDate: null,
        anchorDay: postBody.anchorDay,
        confidence: postBody.confidence,
        source: 'manual',
        observations: null,
        isActive: true,
        version: 0,
        linkedEntityType: postBody.linkedEntityType,
        linkedEntityId: postBody.linkedEntityId,
      }),
      201,
    )
  })

  const dialog = await openCommitmentDialog(page)
  await dialog.getByLabel('Descripción').fill('Abono Estudio Uno')
  await dialog.getByLabel('Tipo').click()
  await page.getByRole('option', { name: 'Ingreso' }).click()
  await dialog.getByLabel('Monto').fill('450000')
  await dialog.getByLabel('Categoría').click()
  await page.getByRole('option', { name: 'Abonos' }).click()
  await dialog.getByLabel('Cliente').click()
  await page.getByRole('option', { name: 'Estudio Uno' }).click()
  await dialog.getByRole('button', { name: 'Agregar' }).click()

  await expect.poll(() => postBody).not.toBeNull()
  // Both halves, or the projection reads the row as unlinked and nets it on the coarse
  // category key instead of against this client's own cobros.
  expect(postBody!.linkedEntityType).toBe('client')
  expect(postBody!.linkedEntityId).toBe('cli-1')
})

test('a gasto fijo names the proveedor it is paid to', async ({ page }) => {
  await applyRole(page, 'owner')

  // Gasto fijo is the dialog's default category, and an outflow. It once offered no
  // picker at all, on the reasoning that `Payment` carries no `fixedExpenseId` — true,
  // and beside the point: the money side never pointed at the expense, it pointed at
  // whoever was paid, and `Payment.providerId` was already there.
  const dialog = await openCommitmentDialog(page)
  await expect(dialog.getByLabel('Proveedor')).toHaveCount(1)
  await expect(dialog.getByLabel('Cliente')).toHaveCount(0)
  await expect(dialog.getByLabel('Colaboradora')).toHaveCount(0)
})

test('a monotributo cuota names its emisor, not a proveedor', async ({ page }) => {
  await applyRole(page, 'owner')

  const dialog = await openCommitmentDialog(page)
  await dialog.getByLabel('Categoría').click()
  await page.getByRole('option', { name: 'Impuestos', exact: true }).click()

  // A workspace runs up to three emisores with their own limits. Collapsing them onto an
  // AFIP-shaped proveedor would let one monotributista's cuota net against another's.
  const picker = dialog.getByLabel('Monotributo')
  await expect(picker).toHaveCount(1)
  await expect(picker).toBeEnabled()
  await expect(dialog.getByText('No se pudo cargar la lista de opciones')).toHaveCount(0)
  await expect(dialog.getByLabel('Proveedor')).toHaveCount(0)
})

test('a direction the pool could never match offers no picker at all', async ({ page }) => {
  await applyRole(page, 'owner')

  const dialog = await openCommitmentDialog(page)
  // An INFLOW that is not an abono. The netting pool is keyed on direction, so a
  // proveedor link here could never match anything: it would read as linked in the
  // register and silently net nothing, which is worse than being plainly unlinked.
  await dialog.getByLabel('Tipo').click()
  await page.getByRole('option', { name: 'Ingreso' }).click()
  await dialog.getByLabel('Categoría').click()
  await page.getByRole('option', { name: 'Otros', exact: true }).click()

  for (const label of ['Cliente', 'Colaboradora', 'Proveedor', 'Monotributo']) {
    await expect(dialog.getByLabel(label)).toHaveCount(0)
  }
})

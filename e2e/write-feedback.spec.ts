import { test, expect } from '@playwright/test'

import { applyRole } from './fixtures/role'
import { stubRoute } from './fixtures/api-mock'

/**
 * A write that failed must not report success.
 *
 * The structural guard proves the
 * `await` is present in the source. These two tests prove what the user actually experiences on
 * either side of it, which no amount of reading the source can: that a 500 leaves the dialog
 * standing with the typed amount intact and no green toast, and that a 200 still closes it.
 *
 * On the negative assertion: the success toast is checked with `.count()` AFTER the error toast
 * has rendered, never with `not.toBeVisible()`. Playwright auto-waits, so a negative visibility
 * assertion run before the write resolves would pass while the request was still in flight — it
 * would pass for the wrong reason, and keep passing after the bug came back.
 */

const RECEIVABLE = {
  id: 'rec-1',
  clientId: 'cli-1',
  clientName: 'Estudio Uno',
  businessName: null,
  taxId: null,
  contactName: null,
  period: '2026-06',
  service: 'Contabilidad',
  baseAmountMinor: '150000',
  extraAmountMinor: '0',
  discountAmountMinor: '0',
  totalAmountMinor: '150000',
  collectedAmountMinor: '0',
  outstandingMinor: '150000',
  currency: 'ARS',
  dueDate: '2026-06-30',
  status: 'pending',
  billingStatus: 'no_invoice',
  emitterId: null,
  emitterCode: null,
  invoiceNumber: null,
  cae: null,
  invoiceIssuedAt: null,
  reviewStatus: null,
  effectiveDate: null,
  planNotes: null,
  extras: [],
  version: 0,
  createdAt: '2026-06-01T00:00:00.000Z',
}

async function openCollectDialog(page: import('@playwright/test').Page) {
  await page.goto('/operacion-mensual', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('main')).toBeVisible()

  // "Clientes y cobros" ships collapsed; the table (and its row actions) mount on expand.
  await page.getByRole('button', { name: /Clientes y cobros/ }).click()

  await page.getByRole('button', { name: 'Acciones del cliente' }).first().click()
  await page.getByRole('menuitem', { name: 'Registrar cobro' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  return dialog
}

test('a failed collect keeps the dialog open, preserves the amount, and never toasts success', async ({
  page,
}) => {
  await applyRole(page, 'owner', { bundle: { receivables: [RECEIVABLE] } })

  // The write fails the way a real outage does: the POST 500s.
  await stubRoute(page, '/receivables/*/collect', (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'boom' }),
    }),
  )

  const dialog = await openCollectDialog(page)
  await dialog.getByLabel('Monto cobrado (ARS)').fill('1234')
  await dialog.getByRole('button', { name: 'Registrar cobro' }).click()

  // The failure surfaces. Waiting on this first is what makes the assertions below meaningful:
  // by the time it renders, the write has resolved and the handler has had its chance to lie.
  await expect(page.getByText('No se pudo guardar el cambio')).toBeVisible()

  // It did not. The dialog is still standing, the typed amount survived, and nothing claimed
  // the cobro was registered.
  await expect(dialog).toBeVisible()
  await expect(dialog.getByLabel('Monto cobrado (ARS)')).toHaveValue('1234')
  expect(await page.getByText('Cobro registrado').count()).toBe(0)
})

test('a successful collect still toasts and closes the dialog', async ({ page }) => {
  await applyRole(page, 'owner', { bundle: { receivables: [RECEIVABLE] } })

  await stubRoute(page, '/receivables/*/collect', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...RECEIVABLE, collectedAmountMinor: '123400', outstandingMinor: '26600' }),
    }),
  )

  const dialog = await openCollectDialog(page)
  await dialog.getByLabel('Monto cobrado (ARS)').fill('1234')
  await dialog.getByRole('button', { name: 'Registrar cobro' }).click()

  await expect(page.getByText('Cobro registrado')).toBeVisible()
  await expect(dialog).not.toBeVisible()
})

import { test, expect } from '@playwright/test'

import { applyRole } from './fixtures/role'
import { stubRoute } from './fixtures/api-mock'

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

  await expect(page.getByText('No se pudo guardar el cambio')).toBeVisible()

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

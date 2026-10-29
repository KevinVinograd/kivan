import { test, expect } from '@playwright/test'

import { applyRole } from './fixtures/role'
import { stubRoute } from './fixtures/api-mock'

const CLIENT = {
  id: 'cli-1',
  name: 'Estudio Uno',
  businessName: null,
  taxId: null,
  status: 'active',
  monthlyFeeMinor: '150000',
  currency: 'ARS',
  billingEntityId: null,
  startDate: null,
  lastIncreaseDate: null,
  contactName: null,
  billingEmail: null,
  phone: null,
  createdAt: '2026-06-01T00:00:00.000Z',
}

async function churn(page: import('@playwright/test').Page) {
  await page.goto('/clients', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('main')).toBeVisible()

  await page.getByRole('button', { name: 'Acciones del cliente' }).first().click()
  await page.getByRole('menuitem', { name: 'Deshabilitar' }).click()

  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Deshabilitar' }).click()
  return dialog
}

test('a failed status write reports the failure and does not claim the client was churned', async ({
  page,
}) => {
  await applyRole(page, 'owner', { clients: [CLIENT] })

  let attempted = false
  await stubRoute(page, '/clients/*/status', (route) => {
    attempted = true
    return route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'boom' }),
    })
  })

  await churn(page)

  await expect(page.getByText('No se pudo deshabilitar al cliente')).toBeVisible()
  expect(attempted).toBe(true)

  expect(await page.getByText('Cliente deshabilitado').count()).toBe(0)
})

test('a successful status write reaches the API and reports it', async ({ page }) => {
  await applyRole(page, 'owner', { clients: [CLIENT] })

  let body: Record<string, unknown> | null = null
  await stubRoute(page, '/clients/*/status', (route) => {
    body = route.request().postDataJSON() as Record<string, unknown>
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...CLIENT, status: 'churned' }),
    })
  })

  await churn(page)

  await expect(page.getByText('Cliente deshabilitado')).toBeVisible()
  expect(body).toEqual({ status: 'churned' })
})

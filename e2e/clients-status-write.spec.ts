import { test, expect } from '@playwright/test'

import { applyRole } from './fixtures/role'
import { stubRoute } from './fixtures/api-mock'

/**
 * `status` is one of the few fields on `/clientes` the API actually models. Most of what the row
 * shows — paid, due, invoice status, billing entity — is deliberate demo content the DTO does not
 * carry, and the actions over it are demo affordances. Marking a client churned is NOT: it used
 * to be a local `setData` plus a green toast, so the owner marked a client churned, was told
 * "Cliente deshabilitado", reloaded, and found the client active again. Silent data loss on a
 * perfectly healthy API.
 *
 * These drive the real endpoint (`POST /clients/:id/status`) on both sides of the outcome.
 */

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
  // "Deshabilitar" is the consolidated soft-removal (still the churned status underneath);
  // it replaced the old "Dar de baja" / "Marcar como pausado" pair.
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

  // The write was attempted — this is the assertion that would have caught the original bug on
  // its own, because the old code never called the endpoint at all.
  await expect(page.getByText('No se pudo deshabilitar al cliente')).toBeVisible()
  expect(attempted).toBe(true)

  // And nothing claimed it worked. `.count()` after the error toast has rendered, not
  // `not.toBeVisible()`: a negative visibility assertion auto-waits and would pass while the
  // request was still in flight — for the wrong reason, and it would keep passing if the bug
  // came back.
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

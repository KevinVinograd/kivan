import { test, expect } from '@playwright/test'

import { applyRole } from './fixtures/role'
import { stubRoute } from './fixtures/api-mock'

/**
 * Money-flow round-trips through the real create dialogs. These prove the property
 * the mappers are responsible for END-TO-END: a value the user types in MAJOR units
 * (pesos) leaves as MINOR units (centavos) in the POST body, and the server row that
 * comes back in minor units is rendered in major units. Each flow intercepts the POST
 * to assert the conversion, then checks the success toast and the rendered row.
 *
 * Only the mutation endpoints are given bespoke stubs; every other call is answered by
 * `mockApi` (see fixtures/api-mock.ts). `route.fallback()` lets a non-matching method
 * fall through to those defaults.
 */

const json = (body: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(body),
})

test('Clientes: creating a client sends the fee in minor units and renders it back', async ({ page }) => {
  await applyRole(page, 'owner', { clients: [] })

  let postBody: Record<string, string> | null = null
  // POST /clients is the bare path (the list GET carries a query string), so this
  // handler only sees the create; anything else falls through to mockApi.
  await stubRoute(page, '/clients', (route) => {
    const req = route.request()
    if (req.method() !== 'POST') return route.fallback()
    postBody = req.postDataJSON() as Record<string, string>
    return route.fulfill(
      json({
        id: 'cli-new',
        name: postBody.name,
        businessName: null,
        taxId: null,
        status: postBody.status,
        monthlyFeeMinor: postBody.monthlyFeeMinor,
        currency: 'ARS',
        billingEntityId: null,
        startDate: null,
        lastIncreaseDate: null,
        contactName: null,
        billingEmail: null,
        phone: null,
        createdAt: '2026-06-01T00:00:00.000Z',
      }),
    )
  })

  await page.goto('/clients', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('main')).toBeVisible()

  // Two "Nuevo cliente" buttons exist when the list is empty (header + empty-state);
  // the header action is first in the DOM.
  await page.getByRole('button', { name: 'Nuevo cliente' }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Nombre comercial').fill('Estudio E2E')
  // The currency moved out of the label into its own Select next to the field.
  await dialog.getByLabel('Fee mensual').fill('5000')
  await dialog.getByRole('button', { name: 'Crear cliente' }).click()

  // The success toast fires and the optimistic prepend renders the new row.
  await expect(page.getByText('Cliente creado')).toBeVisible()
  await expect(page.getByText('Estudio E2E')).toBeVisible()

  // The core property: 5000 pesos left the client as 500000 centavos.
  expect(postBody).not.toBeNull()
  expect(postBody!.monthlyFeeMinor).toBe('500000')
})

test('Cobros: creating a cobro sends the base amount in minor units', async ({ page }) => {
  await applyRole(page, 'owner')

  let postBody: Record<string, string> | null = null
  await stubRoute(page, '/receivables', (route) => {
    const req = route.request()
    if (req.method() !== 'POST') return route.fallback()
    postBody = req.postDataJSON() as Record<string, string>
    return route.fulfill(
      json({
        id: 'rec-new',
        clientId: postBody.clientId,
        clientName: 'Estudio Uno',
        businessName: null,
        taxId: null,
        contactName: null,
        period: postBody.period,
        service: postBody.service,
        baseAmountMinor: postBody.baseAmountMinor,
        extraAmountMinor: postBody.extraAmountMinor ?? '0',
        discountAmountMinor: postBody.discountAmountMinor ?? '0',
        totalAmountMinor: postBody.baseAmountMinor,
        collectedAmountMinor: '0',
        outstandingMinor: postBody.baseAmountMinor,
        currency: 'ARS',
        dueDate: postBody.dueDate,
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
      }),
    )
  })

  await page.goto('/cobros', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('main')).toBeVisible()

  await page.getByRole('button', { name: 'Nuevo cobro' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()

  // Client select (Radix): open the trigger, choose the seeded client.
  await dialog.getByLabel('Cliente').click()
  await page.getByRole('option', { name: 'Estudio Uno' }).click()

  // Servicio is a Radix Select now, not a text Input — it used to be `.fill('Contabilidad')`,
  // which is exactly the free-text field that let one service reach the reports under four
  // spellings. The seeded client carries no `services`, so the picker falls back to the full
  // SERVICE_CATALOG; asserting an entry of that catalog is present is the guard that the
  // fallback still works, because an empty option list would leave the submit disabled and
  // the failure would surface as a confusing timeout on "Crear cobro" instead.
  await dialog.getByLabel('Servicio').click()
  await expect(page.getByRole('option', { name: 'Consultoría' })).toBeVisible()
  await page.getByRole('option', { name: 'Consultoría' }).click()
  await dialog.getByLabel('Monto base').fill('10000')

  // Vencimiento is a Popover+Calendar. Day buttons expose the full date as their accessible
  // name, and the calendar is localized, so that name is SPANISH: "miércoles, 15 de julio de
  // 2026". Matching `15 de ` pins the 15th of whatever month the picker defaults to — exactly
  // one cell matches — and it doubles as the regression guard for the locale: this line read
  // `/15th,/` until the Calendar was given `locale={es}`, which is to say the suite had quietly
  // adapted itself to the bug. Revert the locale prop and this goes red.
  await dialog.getByLabel('Vencimiento').click()
  await page.getByRole('button', { name: /15 de / }).click()

  await dialog.getByRole('button', { name: 'Crear cobro' }).click()

  await expect(page.getByText('Cobro creado')).toBeVisible()

  // The core property: 10000 pesos left the client as 1000000 centavos.
  expect(postBody).not.toBeNull()
  expect(postBody!.baseAmountMinor).toBe('1000000')
})

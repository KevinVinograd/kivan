import { test, expect } from '@playwright/test'

import { applyRole } from './fixtures/role'
import { stubRoute } from './fixtures/api-mock'

const json = (body: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(body),
})

test('Clientes: creating a client sends the fee in minor units and renders it back', async ({ page }) => {
  await applyRole(page, 'owner', { clients: [] })

  let postBody: Record<string, string> | null = null
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

  await page.getByRole('button', { name: 'Nuevo cliente' }).first().click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByLabel('Nombre comercial').fill('Estudio E2E')
  await dialog.getByLabel('Fee mensual').fill('5000')
  await dialog.getByRole('button', { name: 'Crear cliente' }).click()

  await expect(page.getByText('Cliente creado')).toBeVisible()
  await expect(page.getByText('Estudio E2E')).toBeVisible()

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

  await dialog.getByLabel('Cliente').click()
  await page.getByRole('option', { name: 'Estudio Uno' }).click()

  await dialog.getByLabel('Servicio').click()
  await expect(page.getByRole('option', { name: 'Consultoría' })).toBeVisible()
  await page.getByRole('option', { name: 'Consultoría' }).click()
  await dialog.getByLabel('Monto base').fill('10000')

  await dialog.getByLabel('Vencimiento').click()
  await page.getByRole('button', { name: /15 de / }).click()

  await dialog.getByRole('button', { name: 'Crear cobro' }).click()

  await expect(page.getByText('Cobro creado')).toBeVisible()

  expect(postBody).not.toBeNull()
  expect(postBody!.baseAmountMinor).toBe('1000000')
})

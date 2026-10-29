import { test, expect } from '@playwright/test'

import { applyRole } from './fixtures/role'
import { stubRoute } from './fixtures/api-mock'

const json = (body: unknown, status = 200) => ({
  status,
  contentType: 'application/json',
  body: JSON.stringify(body),
})

const API_LIST_LIMIT = 100

async function openCommitmentDialog(page: import('@playwright/test').Page) {
  await page.goto('/cashflow', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('main')).toBeVisible()
  await page.getByRole('tab', { name: 'Compromisos' }).click()
  await page.getByRole('button', { name: 'Agregar' }).first().click()
  await page.getByRole('menuitem', { name: /Compromiso/ }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  return dialog
}

test('the counterparty picker asks the API for a page it will actually serve', async ({ page }) => {
  await applyRole(page, 'owner')

  let listUrl = ''
  page.on('request', (req) => {
    if (req.url().includes('/clients?')) listUrl = req.url()
  })

  const dialog = await openCommitmentDialog(page)
  await dialog.getByLabel('Tipo').click()
  await page.getByRole('option', { name: 'Ingreso' }).click()
  await dialog.getByLabel('Categoría').click()
  await page.getByRole('option', { name: 'Abonos' }).click()

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
  expect(postBody!.linkedEntityType).toBe('client')
  expect(postBody!.linkedEntityId).toBe('cli-1')
})

test('a gasto fijo names the proveedor it is paid to', async ({ page }) => {
  await applyRole(page, 'owner')

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

  const picker = dialog.getByLabel('Monotributo')
  await expect(picker).toHaveCount(1)
  await expect(picker).toBeEnabled()
  await expect(dialog.getByText('No se pudo cargar la lista de opciones')).toHaveCount(0)
  await expect(dialog.getByLabel('Proveedor')).toHaveCount(0)
})

test('a direction the pool could never match offers no picker at all', async ({ page }) => {
  await applyRole(page, 'owner')

  const dialog = await openCommitmentDialog(page)
  await dialog.getByLabel('Tipo').click()
  await page.getByRole('option', { name: 'Ingreso' }).click()
  await dialog.getByLabel('Categoría').click()
  await page.getByRole('option', { name: 'Otros', exact: true }).click()

  for (const label of ['Cliente', 'Colaboradora', 'Proveedor', 'Monotributo']) {
    await expect(dialog.getByLabel(label)).toHaveCount(0)
  }
})

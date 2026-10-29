import { test, expect } from '@playwright/test'

import { applyRole } from './fixtures/role'
import { stubRoute } from './fixtures/api-mock'

const PRODUCTION = {
  id: 'prod-1',
  date: '2026-06-10',
  clientId: 'cli-1',
  clientName: 'Estudio Uno',
  title: 'Reel de lanzamiento',
  type: 'Video',
  responsible: 'Flor Giménez',
  participants: [],
  hours: 8,
  viaticsMinor: '0',
  totalCostMinor: '5000000',
  billable: 'billable',
  billAmountMinor: '9000000',
  status: 'pending',
  notes: null,
  attribution: [],
  version: 0,
}

async function openDeleteDialog(page: import('@playwright/test').Page) {
  await page.goto('/operacion-mensual', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('main')).toBeVisible()

  await page.getByRole('button', { name: /Equipo y pagos/ }).click()
  await page.getByRole('tab', { name: 'Producciones' }).click()

  await page.getByRole('button', { name: 'Acciones de la producción' }).first().click()
  const remove = page.getByRole('menuitem', { name: 'Eliminar' })
  await remove.focus()
  await page.keyboard.press('Enter')

  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toBeVisible()
  return dialog
}

test('a failed delete keeps the confirmation open and the row on screen', async ({ page }) => {
  await applyRole(page, 'owner', { bundle: { productions: [PRODUCTION] } })

  await stubRoute(page, '/productions/*', (route) => {
    if (route.request().method() !== 'DELETE') return route.fallback()
    return route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'boom' }),
    })
  })

  const dialog = await openDeleteDialog(page)
  await dialog.getByRole('button', { name: 'Eliminar' }).click()

  await expect(page.getByText('No se pudo guardar el cambio')).toBeVisible()

  await expect(dialog).toBeVisible()
  expect(await page.getByText('Producción eliminada').count()).toBe(0)

  await dialog.getByRole('button', { name: 'Cancelar' }).click()
  await expect(page.getByRole('row', { name: /Reel de lanzamiento/ })).toBeVisible()
})

test('a successful delete sends the version and reports it', async ({ page }) => {
  await applyRole(page, 'owner', { bundle: { productions: [PRODUCTION] } })

  let url: string | null = null
  await stubRoute(page, '/productions/*', (route) => {
    if (route.request().method() !== 'DELETE') return route.fallback()
    url = route.request().url()
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ deleted: true }),
    })
  })

  const dialog = await openDeleteDialog(page)
  await dialog.getByRole('button', { name: 'Eliminar' }).click()

  await expect(page.getByText('Producción eliminada')).toBeVisible()

  expect(url).toContain('/productions/prod-1')
  expect(url).toContain('version=0')
})

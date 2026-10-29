import { test, expect, type Page } from '@playwright/test'

import { applyRole } from './fixtures/role'

const PRODUCTION = {
  id: 'prod-1',
  date: '2026-06-10',
  clientId: 'cli-1',
  clientName: 'Estudio Uno',
  title: 'Reels de obra',
  type: 'Producción mensual',
  responsible: 'Flor Giménez',
  participants: [],
  hours: 4,
  packHours: 0,
  viaticsMinor: '0',
  totalCostMinor: '8000000',
  billable: 'billable',
  billAmountMinor: '30000000',
  status: 'pending',
  notes: null,
  attribution: [],
  version: 0,
}

async function openProductions(page: Page) {
  await page.getByRole('button', { name: /Equipo y pagos/ }).click()
  await page.getByRole('tab', { name: 'Producciones' }).click()
}

test('a production saved elsewhere shows on Operación mensual when the page opens', async ({ page }) => {
  const seed = { bundle: { productions: [] as unknown[] } }
  await applyRole(page, 'owner', seed)

  await page.goto('/operacion-mensual', { waitUntil: 'domcontentloaded' })
  await openProductions(page)
  await expect(page.getByText('No hay producciones cargadas este mes')).toBeVisible()

  await page.getByRole('link', { name: 'Clientes' }).click()
  await expect(page).toHaveURL(/\/clients/)
  seed.bundle.productions = [PRODUCTION]

  await page.getByRole('link', { name: 'Operación mensual' }).click()
  await expect(page).toHaveURL(/\/operacion-mensual/)
  await openProductions(page)
  await expect(page.getByRole('row', { name: /Reels de obra/ })).toBeVisible()
})

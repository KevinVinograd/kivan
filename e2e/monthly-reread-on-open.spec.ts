import { test, expect, type Page } from '@playwright/test'

import { applyRole } from './fixtures/role'

/**
 * A production written OUTSIDE Operación mensual shows there when the page opens.
 *
 * The month store lives above every route and only re-read on mount, on a month change and
 * after its own writes. Reported from production (22/10): a production loaded from a client's
 * ficha was saved and listed on the ficha, yet absent from Operación mensual until another one
 * was loaded there. The save was never what failed, the re-read was, so the spec models the
 * server side directly: the bundle gains the production while the user is on another page.
 *
 * Navigation is in-app on purpose. A `page.goto` reloads the SPA, which remounts the store and
 * re-reads everything: the exact step that hid this bug from every reload-based check.
 */

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

/** "Producciones" is a tab inside the "Equipo y pagos" section, which mounts collapsed. */
async function openProductions(page: Page) {
  await page.getByRole('button', { name: /Equipo y pagos/ }).click()
  await page.getByRole('tab', { name: 'Producciones' }).click()
}

test('a production saved elsewhere shows on Operación mensual when the page opens', async ({ page }) => {
  // `bundleFor` spreads `seed.bundle` on every request, so reassigning `productions` below is
  // what the server answers from then on.
  const seed = { bundle: { productions: [] as unknown[] } }
  await applyRole(page, 'owner', seed)

  await page.goto('/operacion-mensual', { waitUntil: 'domcontentloaded' })
  await openProductions(page)
  await expect(page.getByText('No hay producciones cargadas este mes')).toBeVisible()

  await page.getByRole('link', { name: 'Clientes' }).click()
  await expect(page).toHaveURL(/\/clients/)
  // The production loaded from the client's ficha, as far as the server is concerned.
  seed.bundle.productions = [PRODUCTION]

  await page.getByRole('link', { name: 'Operación mensual' }).click()
  await expect(page).toHaveURL(/\/operacion-mensual/)
  await openProductions(page)
  await expect(page.getByRole('row', { name: /Reels de obra/ })).toBeVisible()
})

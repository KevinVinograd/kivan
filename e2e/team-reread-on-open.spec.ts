import { test, expect, type Page } from '@playwright/test'

import { applyRole } from './fixtures/role'

/**
 * A production written on Operación mensual shows on the person's Trabajo tab when Equipo
 * opens.
 *
 * The team store lives above every route and reads the month's plan on its own, on mount and
 * on "Reintentar" only. A production loaded or approved on Operación mensual therefore never
 * reached the person it was attributed to for the rest of the session. Found on 22/10 while
 * chasing the same gap from the other side (`monthly-reread-on-open.spec.ts`). As there, the
 * server side is modelled directly and every move after the first load is a click: a
 * `page.goto` reloads the SPA, which re-reads every store and hides the bug.
 */

const PRODUCTION = {
  id: 'prod-1',
  date: '2026-06-10',
  clientId: 'cli-1',
  clientName: 'Estudio Uno',
  title: 'Reels de obra',
  type: 'Producción mensual',
  responsible: 'Micaela Duarte',
  participants: [],
  hours: 4,
  packHours: 0,
  viaticsMinor: '0',
  totalCostMinor: '8000000',
  billable: 'billable',
  billAmountMinor: '30000000',
  status: 'pending',
  notes: null,
  // Who worked it: what puts it on Micaela's Trabajo tab.
  attribution: [{ teamMemberId: 'tm-mica', hours: 4, role: 'responsible' }],
  version: 0,
}

async function openMicaelaWork(page: Page) {
  await page.getByText('Micaela Duarte', { exact: true }).first().click()
  await page.getByRole('tab', { name: 'Trabajo' }).click()
}

test('a production saved on Operación mensual shows on the person when Equipo opens', async ({ page }) => {
  // `bundleFor` spreads `seed.bundle` on every request, so reassigning `productions` below is
  // what the server answers from then on.
  const seed = { bundle: { productions: [] as unknown[] } }
  await applyRole(page, 'owner', seed)

  await page.goto('/team', { waitUntil: 'domcontentloaded' })
  await openMicaelaWork(page)
  await expect(page.getByText('Carga mensual')).toBeVisible()
  expect(await page.getByText(/Estudio Uno · /).count()).toBe(0)

  await page.getByRole('link', { name: 'Operación mensual' }).click()
  await expect(page).toHaveURL(/\/operacion-mensual/)
  // The production loaded there, as far as the server is concerned.
  seed.bundle.productions = [PRODUCTION]

  await page.getByRole('link', { name: 'Equipo' }).click()
  await expect(page).toHaveURL(/\/team/)
  await openMicaelaWork(page)
  // `.first()`: the Viáticos card further down lists the same production.
  await expect(page.getByText(/Estudio Uno · /).first()).toBeVisible()
})

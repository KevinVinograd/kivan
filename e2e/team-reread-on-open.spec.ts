import { test, expect, type Page } from '@playwright/test'

import { applyRole } from './fixtures/role'

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
  attribution: [{ teamMemberId: 'tm-mica', hours: 4, role: 'responsible' }],
  version: 0,
}

async function openMicaelaWork(page: Page) {
  await page.getByText('Micaela Duarte', { exact: true }).first().click()
  await page.getByRole('tab', { name: 'Trabajo' }).click()
}

test('a production saved on Operación mensual shows on the person when Equipo opens', async ({ page }) => {
  const seed = { bundle: { productions: [] as unknown[] } }
  await applyRole(page, 'owner', seed)

  await page.goto('/team', { waitUntil: 'domcontentloaded' })
  await openMicaelaWork(page)
  await expect(page.getByText('Carga mensual')).toBeVisible()
  expect(await page.getByText(/Estudio Uno · /).count()).toBe(0)

  await page.getByRole('link', { name: 'Operación mensual' }).click()
  await expect(page).toHaveURL(/\/operacion-mensual/)
  seed.bundle.productions = [PRODUCTION]

  await page.getByRole('link', { name: 'Equipo' }).click()
  await expect(page).toHaveURL(/\/team/)
  await openMicaelaWork(page)
  await expect(page.getByText(/Estudio Uno · /).first()).toBeVisible()
})

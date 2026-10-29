import { test, expect } from '@playwright/test'

import { applyRole } from './fixtures/role'
import { stubJson, stubRoute } from './fixtures/api-mock'

const CREATED = {
  id: 'prod-1',
  date: '2026-06-10',
  clientId: 'cli-1',
  clientName: 'Estudio Uno',
  title: 'Producción extra',
  type: 'Producción extra',
  responsible: null,
  participants: [],
  hours: 2,
  packHours: 0,
  viaticsMinor: '0',
  totalCostMinor: '0',
  billable: null,
  billAmountMinor: '0',
  status: 'pending',
  notes: null,
  attribution: [],
  version: 0,
}

test('loading a production with no content creator keeps Equipo working', async ({ page }) => {
  await applyRole(page, 'owner')
  await stubJson(page, '/assignments**', [])
  await stubJson(page, '/clients/*/service-lines', [])
  await stubRoute(page, '/months/*/productions', (route) => {
    if (route.request().method() !== 'POST') return route.fallback()
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify(CREATED) })
  })

  await page.goto('/clients', { waitUntil: 'domcontentloaded' })
  await page.getByText('Estudio Uno', { exact: true }).first().click()
  await page.getByRole('tab', { name: 'Equipo' }).click()
  await page.getByRole('button', { name: 'Cargar producción' }).last().click()

  const dialog = page.getByRole('dialog')
  await dialog.getByRole('combobox', { name: 'Tipo de producción' }).click()
  await page.getByRole('option', { name: 'Producción extra' }).first().click()
  await dialog.getByLabel('Horas').fill('2')
  await dialog.getByRole('button', { name: 'Cargar producción' }).click()
  await expect(page.getByText('Producción cargada').first()).toBeVisible()

  await page.getByRole('link', { name: 'Equipo' }).click()
  await expect(page).toHaveURL(/\/team/)
  await expect(page.getByRole('heading', { name: 'Equipo', level: 1 })).toBeVisible()
  expect(await page.getByText('Algo salió mal').count()).toBe(0)
})

import { test, expect } from '@playwright/test'

import { applyRole } from './fixtures/role'
import { stubRoute } from './fixtures/api-mock'

const failWith500 = () => ({
  status: 500,
  contentType: 'application/json',
  body: JSON.stringify({ message: 'boom' }),
})

test('Operación mensual: a failed plan bundle shows an error, not a zeroed month', async ({ page }) => {
  await applyRole(page, 'owner')

  let planRequests = 0
  await stubRoute(page, '/months/*/plan', (route) => {
    planRequests += 1
    return route.fulfill(failWith500())
  })

  await page.goto('/operacion-mensual', { waitUntil: 'domcontentloaded' })

  await expect(page.getByRole('heading', { name: 'No pudimos cargar el mes' })).toBeVisible()

  await expect(page.getByText('Rentabilidad estimada')).toHaveCount(0)
  await expect(page.getByText('Pendiente de cobro')).toHaveCount(0)

  await expect(page.getByRole('button', { name: 'Cerrar mes' })).toHaveCount(0)

  const before = planRequests
  await page.getByRole('button', { name: 'Reintentar' }).click()
  await expect.poll(() => planRequests).toBeGreaterThan(before)
})

test('Operación mensual: retry recovers the month once the backend answers', async ({ page }) => {
  await applyRole(page, 'owner')

  let backend: 'down' | 'up' = 'down'
  await stubRoute(page, '/months/*/plan', (route) =>
    backend === 'down' ? route.fulfill(failWith500()) : route.fallback(),
  )

  await page.goto('/operacion-mensual', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'No pudimos cargar el mes' })).toBeVisible()

  backend = 'up'
  await page.getByRole('button', { name: 'Reintentar' }).click()

  await expect(page.getByRole('heading', { name: 'No pudimos cargar el mes' })).toHaveCount(0)
  await expect(page.getByText('Pendiente de cobro').first()).toBeVisible()
})

test('Operación mensual: the month selector survives the load, the close action does not', async ({
  page,
}) => {
  await applyRole(page, 'owner')
  await stubRoute(page, '/months/*/plan', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2500))
    return route.fallback()
  })

  await page.goto('/operacion-mensual', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)

  const duringLoad = {
    monthSelector: await page.getByRole('combobox').count(),
    closeAction: await page.getByRole('button', { name: 'Cerrar mes' }).count(),
  }

  expect(duringLoad.monthSelector).toBeGreaterThan(0)

  expect(duringLoad.closeAction).toBe(0)

  await expect(page.getByText('Pendiente de cobro').first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: 'Cerrar mes' }).first()).toBeVisible()
})

test('Dashboard (owner): a failed plan bundle shows an error, not an empty month', async ({ page }) => {
  await applyRole(page, 'owner')
  await stubRoute(page, '/months/*/plan', (route) => route.fulfill(failWith500()))

  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })

  await expect(page.getByRole('heading', { name: 'No pudimos cargar el dashboard' })).toBeVisible()
  await expect(page.getByText('Todavía no hay datos cargados para este mes')).toHaveCount(0)
})

test('Equipo: a failed roster fetch shows an error, not an empty roster', async ({ page }) => {
  await applyRole(page, 'owner')
  await stubRoute(page, '/team-members**', (route) => route.fulfill(failWith500()))

  await page.goto('/team', { waitUntil: 'domcontentloaded' })

  await expect(page.getByRole('heading', { name: 'No pudimos cargar el equipo' })).toBeVisible()
})

test('Pagos: a failed payments fetch shows an error, not an empty table', async ({ page }) => {
  await applyRole(page, 'owner')
  await stubRoute(page, '/payments**', (route) => route.fulfill(failWith500()))

  await page.goto('/pagos', { waitUntil: 'domcontentloaded' })

  await expect(
    page.getByRole('heading', { name: 'No pudimos cargar la información de cobranza y pagos' }),
  ).toBeVisible()
})

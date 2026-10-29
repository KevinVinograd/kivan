import { test, expect } from '@playwright/test'

import { applyRole } from './fixtures/role'
import { stubJson } from './fixtures/api-mock'

for (const failing of ['/receivables', '/payments'] as const) {
  test(`a failed GET ${failing} shows the error state, not a projection built from zero`, async ({
    page,
  }) => {
    await applyRole(page, 'owner')
    await stubJson(page, `${failing}**`, { message: 'boom' }, 500)

    await page.goto('/cashflow', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('main')).toBeVisible()

    await expect(page.getByRole('heading', { name: 'No pudimos cargar la tesorería' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible()

    expect(await page.getByRole('tab', { name: 'Proyección' }).count()).toBe(0)
    expect(await page.getByRole('tab', { name: 'Posición' }).count()).toBe(0)
  })
}

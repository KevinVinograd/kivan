import { test, expect } from '@playwright/test'

import { applyRole } from './fixtures/role'
import { stubJson } from './fixtures/api-mock'

/**
 * `/cashflow` is fed by THREE fetches — treasury (accounts + commitments), receivables and
 * payments — and every figure on it is computed from all three together. Only the treasury one
 * gated the page. So a healthy treasury plus a failed `GET /receivables` rendered a confident
 * 13-week running-balance curve with **zero inflows**, and a cash-crunch verdict derived from
 * it, with no hint that anything was missing. The owner would plan payroll against it.
 *
 * These drive the two stores the page used to ignore. The `/receivables` and `/payments` stubs
 * are 500s, everything else is answered by `mockApi`.
 */
for (const failing of ['/receivables', '/payments'] as const) {
  test(`a failed GET ${failing} shows the error state, not a projection built from zero`, async ({
    page,
  }) => {
    await applyRole(page, 'owner')
    await stubJson(page, `${failing}**`, { message: 'boom' }, 500)

    await page.goto('/cashflow', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('main')).toBeVisible()

    // The page says it could not load, and offers the way back.
    await expect(page.getByRole('heading', { name: 'No pudimos cargar la tesorería' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible()

    // And it does NOT render the projection. Asserted with `.count()` on the tabs that only
    // exist on the happy path: `not.toBeVisible()` would auto-wait and could pass simply
    // because the page had not finished rendering yet — passing for the wrong reason, and
    // still passing once the bug came back.
    expect(await page.getByRole('tab', { name: 'Proyección' }).count()).toBe(0)
    expect(await page.getByRole('tab', { name: 'Posición' }).count()).toBe(0)
  })
}

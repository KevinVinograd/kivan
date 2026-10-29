import { test, expect } from '@playwright/test'

import { applyRole } from './fixtures/role'

test.describe('mobile drawer', () => {
  test.skip(
    ({ viewport }) => (viewport?.width ?? Number.MAX_SAFE_INTEGER) >= 768,
    'the SideNav is a persistent rail at md and up — there is no drawer to close',
  )

  test('closes itself when a nav item navigates the page underneath it', async ({ page }) => {
    await applyRole(page, 'owner')

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('main')).toBeVisible()

    const trigger = page.getByRole('button', { name: 'Open navigation' })
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')

    await trigger.click()
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')

    await page.getByRole('link', { name: 'Clientes' }).click()

    await expect(page).toHaveURL(/\/clients/)
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })
})

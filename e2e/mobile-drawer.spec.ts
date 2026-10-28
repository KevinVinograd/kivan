import { test, expect } from '@playwright/test'

import { applyRole } from './fixtures/role'

/**
 * Below `md` the SideNav is an off-canvas drawer over a full-screen backdrop, and its items
 * are plain `<Link>`s: tapping one navigates the page UNDERNEATH the drawer and leaves the
 * drawer — and its `fixed inset-0` backdrop — standing on top of the page the user just asked
 * for. The only way out was to find the X. The fix closes it on the route transition that the
 * app shell already tracks for focus management.
 *
 * Scoped by viewport width, the same lever `role-walkthrough.spec.ts` uses: above `md` there
 * is no drawer to close, so the drawer trigger this test drives does not exist there.
 */
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

    // The page navigated...
    await expect(page).toHaveURL(/\/clients/)
    // ...and the drawer did not stay on top of it. Asserted through `aria-expanded`, which is
    // bound to the same `drawerOpen` state the panel and the backdrop render from, so this
    // cannot pass while either is still covering the page.
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')
  })
})

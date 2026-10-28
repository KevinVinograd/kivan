import { test, expect } from '@playwright/test'

import { applyRole } from './fixtures/role'

/**
 * HOLD saw the selected "Clientes" row squashed ("apachurrado", 2026-10-21). The active row
 * carries `overflow-hidden` to clip the brand chevron, and that drops its automatic minimum
 * height to 0: on a rail shorter than its content the browser shrank the selected row before
 * the nav started scrolling, while every inactive row held its height. The rows are
 * `shrink-0` now, so the nav scrolls instead.
 *
 * A short desktop window is the whole repro, so the test is scoped to the rail (md and up).
 */
test.describe('side nav', () => {
  test.skip(
    ({ viewport }) => (viewport?.width ?? 0) < 768,
    'below md the SideNav is a drawer, not the persistent rail',
  )

  test('keeps the selected row as tall as the others on a short window', async ({ page }) => {
    await applyRole(page, 'owner')
    await page.setViewportSize({ width: 1280, height: 480 })

    await page.goto('/clients', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('main')).toBeVisible()

    const selected = page.locator('a[aria-current="page"]', { hasText: 'Clientes' })
    const other = page.getByRole('link', { name: 'Dashboard' })
    await expect(selected).toBeVisible()

    const selectedBox = await selected.boundingBox()
    const otherBox = await other.boundingBox()
    expect(selectedBox).not.toBeNull()
    expect(otherBox).not.toBeNull()
    expect(selectedBox!.height).toBeGreaterThanOrEqual(otherBox!.height)
  })

  // The collapsed rail's group flyout trigger is a direct child of the nav too, and it carries
  // the active card (and its `overflow-hidden`) whenever one of its children is the route. It
  // missed the `shrink-0` the rows got, so on the icon rail the Finanzas square was crushed.
  test('keeps the collapsed group trigger square on a short window', async ({ page }) => {
    await applyRole(page, 'owner')
    await page.setViewportSize({ width: 1280, height: 420 })

    await page.goto('/cobros', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('main')).toBeVisible()

    // The collapse toggle only takes pointer events while the rail (`group/nav`, the aside)
    // is hovered.
    await page.locator('aside').filter({ has: page.getByRole('navigation', { name: 'Primary' }) }).hover()
    await page.getByRole('button', { name: 'Collapse navigation' }).click()

    const trigger = page.getByRole('button', { name: 'Finanzas' })
    await expect(trigger).toBeVisible()
    const box = await trigger.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.height).toBeGreaterThanOrEqual(36)
  })
})

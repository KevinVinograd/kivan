import { test, expect } from '@playwright/test'

import { applyRole } from './fixtures/role'

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

  test('keeps the collapsed group trigger square on a short window', async ({ page }) => {
    await applyRole(page, 'owner')
    await page.setViewportSize({ width: 1280, height: 420 })

    await page.goto('/cobros', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('main')).toBeVisible()

    await page.locator('aside').filter({ has: page.getByRole('navigation', { name: 'Primary' }) }).hover()
    await page.getByRole('button', { name: 'Collapse navigation' }).click()

    const trigger = page.getByRole('button', { name: 'Finanzas' })
    await expect(trigger).toBeVisible()
    const box = await trigger.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.height).toBeGreaterThanOrEqual(36)
  })
})

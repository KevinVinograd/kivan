import { test, expect } from '@playwright/test'

import { stubJson } from './fixtures/api-mock'
import { applyRole } from './fixtures/role'

test.describe('stacked panel content', () => {
  test.skip(
    ({ viewport }) => (viewport?.width ?? 0) < 1024,
    'the desktop layout is the one that squashed',
  )

  for (const { route, label } of [
    { route: '/team?open=tm-mica', label: 'Buscar personas' },
    { route: '/clients?open=cli-1', label: 'Buscar clientes' },
  ]) {
    test(`keeps the ${route} search at its full height on a short window`, async ({ page }) => {
      await applyRole(page, 'owner')
      await page.setViewportSize({ width: 1280, height: 300 })

      await page.goto(route, { waitUntil: 'domcontentloaded' })
      const search = page
        .locator('section[data-type="compact"]')
        .getByRole('textbox', { name: label })
      await expect(search).toBeVisible()

      const box = await search.boundingBox()
      expect(box).not.toBeNull()
      expect(box!.height).toBe(40)
    })
  }

  const ACCOUNTS = [
    ['BBVA', 'shared', 'bank', false, null],
    ['EFECTIVO $ FF', 'flor', 'cash', false, null],
    ['EFECTIVO USD VT', 'vicky', 'cash', true, null],
    [
      'GALICIA FF',
      'flor',
      'investment',
      true,
      'Saldo FCI anterior: 24546.10 cuotapartes. Cargá acá el valor del fondo en pesos.',
    ],
  ].map(([name, partner, type, isReserve, note], index) => ({
    id: `acc-${index}`,
    name,
    partner,
    type,
    balanceArsMinor: '123456789000',
    balanceUsdMinor: '1234500',
    isReserve,
    note,
    isActive: true,
    version: 1,
  }))

  for (const width of [1280, 1440]) {
    test(`fits the cashflow accounts table in its card at ${width}px`, async ({ page }) => {
      await applyRole(page, 'owner')
      await stubJson(page, '/treasury/accounts', ACCOUNTS)
      await page.setViewportSize({ width, height: 900 })

      await page.goto('/settings?section=cashflow', { waitUntil: 'domcontentloaded' })
      const container = page.locator('[data-slot="table-container"]')
      await expect(container.getByText('GALICIA FF')).toBeVisible()

      const { scrollWidth, clientWidth } = await container.evaluate((el) => ({
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      }))
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
    })
  }
})

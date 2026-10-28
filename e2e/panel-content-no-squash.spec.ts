import { test, expect } from '@playwright/test'

import { stubJson } from './fixtures/api-mock'
import { applyRole } from './fixtures/role'

/**
 * Two layout defects reported on 2026-10-22, both inside a stacked `PanelContent`.
 *
 * 1. The Equipo and Clientes search fields rendered ~28px tall instead of 40. `PanelContent`
 *    is a scrolling flex column, and a child with a fixed height (`h-10`) is allowed to
 *    shrink to its content before the column scrolls. Cobros and Pagos had each been patched
 *    with a local `shrink-0`; the stacked layout now keeps every child at its own height.
 *
 * 2. The Configuración > Cashflow accounts table did not fit its 600px card: six columns plus
 *    a `whitespace-nowrap` note pushed Socia, Tipo, the balances and the actions behind the
 *    trailing fade.
 *
 * Desktop only: below md the list pages swap the search for the Toolbar and settings is a
 * two-step drilldown.
 */
test.describe('stacked panel content', () => {
  test.skip(
    ({ viewport }) => (viewport?.width ?? 0) < 1024,
    'the desktop layout is the one that squashed',
  )

  // With nothing selected the list page is content-sized and scrolls as a page, so nothing
  // squashes. The defect lives in the split: a record open (`?open=`) turns the list into a
  // height-bound panel, which is what the reported screenshot showed.
  // The table under the split keeps its own search with the same accessible name, so the
  // field is looked up inside the compact list panel.
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

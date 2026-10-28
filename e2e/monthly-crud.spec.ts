import { test, expect } from '@playwright/test'

import { applyRole } from './fixtures/role'
import { stubRoute } from './fixtures/api-mock'

/**
 * Editing and deleting a monthly production. The client functions and the backend routes have
 * both existed all along — `updateProduction` / `deleteProduction` simply had zero call sites,
 * so a fat-fingered production was permanent and went on polluting the month's profitability
 * and its close validations forever.
 *
 * The delete is the one worth a browser test: it is destructive, it moves money (a production's
 * hours and cost feed rentabilidad), and its failure mode is the expensive one — a confirmation
 * dialog that dismisses itself on a write that did not land tells the user the row is gone while
 * it is still sitting there behind it.
 */

const PRODUCTION = {
  id: 'prod-1',
  date: '2026-06-10',
  clientId: 'cli-1',
  clientName: 'Estudio Uno',
  title: 'Reel de lanzamiento',
  type: 'Video',
  responsible: 'Flor Giménez',
  participants: [],
  hours: 8,
  viaticsMinor: '0',
  totalCostMinor: '5000000',
  billable: 'billable',
  billAmountMinor: '9000000',
  status: 'pending',
  notes: null,
  // The real API always sends this (who worked the production); mirroring it here keeps
  // the fixture honest now that the team store reads it.
  attribution: [],
  version: 0,
}

async function openDeleteDialog(page: import('@playwright/test').Page) {
  await page.goto('/operacion-mensual', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('main')).toBeVisible()

  // Producciones is a tab INSIDE the "Equipo y pagos" collapsible, which ships collapsed.
  await page.getByRole('button', { name: /Equipo y pagos/ }).click()
  await page.getByRole('tab', { name: 'Producciones' }).click()

  await page.getByRole('button', { name: 'Acciones de la producción' }).first().click()
  // By keyboard, as a person would when the menu opens against the bottom edge: at 1280×720
  // Radix places it past the fold and a fixed menu cannot be scrolled to, so a click waited
  // forever on "element is outside of the viewport" (flaky, on production code too, 22/10).
  const remove = page.getByRole('menuitem', { name: 'Eliminar' })
  await remove.focus()
  await page.keyboard.press('Enter')

  const dialog = page.getByRole('alertdialog')
  await expect(dialog).toBeVisible()
  return dialog
}

test('a failed delete keeps the confirmation open and the row on screen', async ({ page }) => {
  await applyRole(page, 'owner', { bundle: { productions: [PRODUCTION] } })

  await stubRoute(page, '/productions/*', (route) => {
    if (route.request().method() !== 'DELETE') return route.fallback()
    return route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ message: 'boom' }),
    })
  })

  const dialog = await openDeleteDialog(page)
  await dialog.getByRole('button', { name: 'Eliminar' }).click()

  await expect(page.getByText('No se pudo guardar el cambio')).toBeVisible()

  // The confirmation is still standing, and nothing claimed the production was removed.
  // `.count()` after the error toast rendered — a `not.toBeVisible()` would auto-wait and could
  // pass while the request was still in flight, i.e. for the wrong reason.
  await expect(dialog).toBeVisible()
  expect(await page.getByText('Producción eliminada').count()).toBe(0)

  // And the row survived. Asserted only after dismissing the confirmation: it is a modal, so
  // while it is open the table is `aria-hidden` and a role query cannot see the row at all —
  // which would make a "row is gone" assertion pass for entirely the wrong reason.
  await dialog.getByRole('button', { name: 'Cancelar' }).click()
  await expect(page.getByRole('row', { name: /Reel de lanzamiento/ })).toBeVisible()
})

test('a successful delete sends the version and reports it', async ({ page }) => {
  await applyRole(page, 'owner', { bundle: { productions: [PRODUCTION] } })

  let url: string | null = null
  await stubRoute(page, '/productions/*', (route) => {
    if (route.request().method() !== 'DELETE') return route.fallback()
    url = route.request().url()
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ deleted: true }),
    })
  })

  const dialog = await openDeleteDialog(page)
  await dialog.getByRole('button', { name: 'Eliminar' }).click()

  await expect(page.getByText('Producción eliminada')).toBeVisible()

  // The optimistic-concurrency version rides along: without it the backend cannot tell this
  // delete from one racing against a row someone else already changed.
  expect(url).toContain('/productions/prod-1')
  expect(url).toContain('version=0')
})

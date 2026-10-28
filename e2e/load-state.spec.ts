import { test, expect } from '@playwright/test'

import { applyRole } from './fixtures/role'
import { stubRoute } from './fixtures/api-mock'

/**
 * Load state must come from the fetch, never from a timer.
 *
 * Every test here fails the ONE endpoint a screen depends on and asserts the screen says
 * so. Before this suite's fix, each of these pages ran `setTimeout(() => setStatus('ready'),
 * 400)` — a timer decoupled from the request — so `status` flipped to ready whether the
 * fetch had succeeded, was in flight, or had failed. Their error states were unreachable
 * dead code, and a backend outage rendered as *confident, wrong content*: zeroed money on
 * Operación mensual, an "empty month" on the dashboards, "no members yet" on Equipo.
 *
 * These assert the negative too (the fabricated figure is ABSENT), because "shows an error"
 * and "does not show a fake number" are different claims and only the second one is the bug.
 */

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

  // The actual defect: the provider seeds every period with EMPTY_DATA, so a failed fetch
  // used to render a full KPI strip of $0 figures with `Rentabilidad estimada $0` tinted
  // green. None of it may be on screen.
  await expect(page.getByText('Rentabilidad estimada')).toHaveCount(0)
  await expect(page.getByText('Pendiente de cobro')).toHaveCount(0)

  // `Cerrar mes` must be gone too: closeBlockers derives every blocker from the month's rows,
  // so against EMPTY_DATA it returns zero blockers and the close would have sailed through.
  await expect(page.getByRole('button', { name: 'Cerrar mes' })).toHaveCount(0)

  // Retry must re-issue the request, not restart a timer.
  const before = planRequests
  await page.getByRole('button', { name: 'Reintentar' }).click()
  await expect.poll(() => planRequests).toBeGreaterThan(before)
})

test('Operación mensual: retry recovers the month once the backend answers', async ({ page }) => {
  await applyRole(page, 'owner')

  // Gate on a MODE the test flips, not on "fail the first request": React StrictMode
  // double-invokes the mount effect in dev, so a fail-once stub is already exhausted by the
  // second call and the page would load cleanly. The backend stays down until we say so.
  let backend: 'down' | 'up' = 'down'
  await stubRoute(page, '/months/*/plan', (route) =>
    backend === 'down' ? route.fulfill(failWith500()) : route.fallback(),
  )

  await page.goto('/operacion-mensual', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: 'No pudimos cargar el mes' })).toBeVisible()

  backend = 'up'
  await page.getByRole('button', { name: 'Reintentar' }).click()

  // The retry actually refetches, so the month renders. This is the half a timer can never
  // do: the old `Reintentar` restarted a 400ms clock and landed back on the same screen.
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
  await page.waitForTimeout(800) // mid-flight, while the bundle is still in the air

  // SNAPSHOT counts, not `toBeVisible()` / `toHaveCount()`. Those auto-wait up to 15s, which
  // sails straight past the loading window and ends up asserting against the LOADED page —
  // the assertion then passes for the wrong reason and guards nothing. These read the DOM at
  // one instant, and that instant is mid-fetch.
  const duringLoad = {
    monthSelector: await page.getByRole('combobox').count(),
    closeAction: await page.getByRole('button', { name: 'Cerrar mes' }).count(),
  }

  // The selector MUST stay. Changing the month is what puts the page back into `loading`, so
  // dropping it here would make the control vanish under the user the moment they used it,
  // and strand them until the fetch settled. It is also the only way out of a failed month.
  expect(duringLoad.monthSelector).toBeGreaterThan(0)

  // `Cerrar mes` MUST NOT. closeBlockers derives every blocker from the month's rows, so an
  // unloaded month reports zero blockers and the close would go straight through.
  expect(duringLoad.closeAction).toBe(0)

  await expect(page.getByText('Pendiente de cobro').first()).toBeVisible({ timeout: 15_000 })
  // `.first()`: once the month is loaded, "Cerrar mes" is both the header action AND the
  // AiInsight CTA (the insight resolves to the close when nothing is blocking it).
  await expect(page.getByRole('button', { name: 'Cerrar mes' }).first()).toBeVisible()
})

test('Dashboard (owner): a failed plan bundle shows an error, not an empty month', async ({ page }) => {
  await applyRole(page, 'owner')
  await stubRoute(page, '/months/*/plan', (route) => route.fulfill(failWith500()))

  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })

  await expect(page.getByRole('heading', { name: 'No pudimos cargar el dashboard' })).toBeVisible()
  // The old timer made `error` unreachable, so a failed fetch fell through to this empty
  // state and told the owner the month held no data. It held data; the app never asked.
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

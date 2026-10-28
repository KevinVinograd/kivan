import { test, expect, type Page } from '@playwright/test'
import { applyRole, type Role } from './fixtures/role'

/**
 * Role-driven heuristic walkthrough.
 *
 * For each role it walks the primary hooks declared in that role's persona
 * and mechanically checks H1 to H3
 * of the rubric:
 *  - allowed routes stay put and render their `<main>` content (reachable, not a
 *    dead-end);
 *  - blocked routes are redirected to `/dashboard` by `RoleGate` (containment).
 *
 * H4 (feedback) and H5 (clarity) are human judgement layered on a green run.
 */

type Access = 'allowed' | 'blocked'
type Hook = { task: string; route: string; access: Access }

/** RoleGate redirects any blocked route to this path (see src/app/role-gate.tsx). */
const REDIRECT_FALLBACK = '/dashboard'

const WALKTHROUGHS: Record<Role, Hook[]> = {
  owner: [
    { task: 'Read state of the month', route: '/dashboard', access: 'allowed' },
    { task: 'Review monthly close', route: '/operacion-mensual', access: 'allowed' },
    { task: 'Review profitability', route: '/reports', access: 'allowed' },
    { task: 'Review account ledger', route: '/cuentas-corrientes', access: 'allowed' },
  ],
  admin: [
    { task: 'Run monthly operation', route: '/operacion-mensual', access: 'allowed' },
    { task: 'Manage clients', route: '/clients', access: 'allowed' },
    { task: 'Land on dashboard', route: '/dashboard', access: 'allowed' },
    // Finanzas is owner/admin (cash surface): admin keeps access, the Equipo does not.
    { task: 'Review collections', route: '/cobros', access: 'allowed' },
    { task: 'Review account ledger', route: '/cuentas-corrientes', access: 'allowed' },
  ],
  employee: [
    { task: 'See my dashboard', route: '/dashboard', access: 'allowed' },
    { task: 'Work assigned clients', route: '/clients', access: 'allowed' },
    { task: 'Blocked: operation hub', route: '/operacion-mensual', access: 'blocked' },
    { task: 'Blocked: reports', route: '/reports', access: 'blocked' },
    // Finanzas cash surfaces are owner/admin-only — the Equipo never sees money.
    { task: 'Blocked: collections', route: '/cobros', access: 'blocked' },
    { task: 'Blocked: payouts', route: '/pagos', access: 'blocked' },
    { task: 'Blocked: billing', route: '/billing', access: 'blocked' },
    { task: 'Blocked: account ledger', route: '/cuentas-corrientes', access: 'blocked' },
  ],
}

function pathnameOf(url: string): string {
  return new URL(url).pathname
}

for (const role of Object.keys(WALKTHROUGHS) as Role[]) {
  test.describe(`role: ${role}`, () => {
    for (const hook of WALKTHROUGHS[role]) {
      test(`${hook.access}: ${hook.task} (${hook.route})`, async ({ page }) => {
        await applyRole(page, role)
        // domcontentloaded (not 'load'): the SPA renders after the document parses
        // and its scripts run; waiting for full 'load' on the Vite dev bundle is
        // flaky. The auto-waiting assertions below handle the React render.
        await page.goto(hook.route, { waitUntil: 'domcontentloaded' })

        if (hook.access === 'allowed') {
          // H1/H2: the role stays on the route and the page renders its main content.
          await expect(page.locator('main')).toBeVisible()
          expect(pathnameOf(page.url())).toBe(hook.route)
        } else {
          // H3: the route guard redirects the role away to the dashboard.
          await expect
            .poll(() => pathnameOf(page.url()))
            .toBe(REDIRECT_FALLBACK)
        }
      })
    }
  })
}

test.describe('employee self-service (Mi trabajo)', () => {
  test('employee can open a self work-tracking dialog from their own profile', async ({ page }) => {
    await applyRole(page, 'employee')
    await page.goto('/team?tab=trabajo', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('main')).toBeVisible()
    // The self perspective exposes the hero "Cargar" affordance (hours/producción/
    // viático/extra), distinct from the manager action set.
    await expect(page.getByRole('button', { name: 'Cargar' }).first()).toBeVisible()
    // No "Cargar producción" for the employee: creating a production is an owner/admin
    // write, and the dialog this used to open could only end in a 403.
    await expect(page.getByRole('button', { name: 'Cargar producción' })).toHaveCount(0)
  })
  test('employee cannot see manager actions on their profile', async ({ page }) => {
    await applyRole(page, 'employee')
    await page.goto('/team', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('main')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Asignar a cliente' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Más acciones' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Aprobar pago|Pagar|Confirmar pagado/ })).toHaveCount(0)
  })
  test('employee cannot see payroll or client money on Mi trabajo', async ({ page }) => {
    await applyRole(page, 'employee')
    await page.goto('/team', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('main')).toBeVisible()
    // The Pagos tab is the company payroll lifecycle (statement, tarifa, payment
    // history): manager-only, never shown to the Equipo self-view.
    await expect(page.getByRole('tab', { name: 'Pagos' })).toHaveCount(0)
    // The own-pay figure is a payroll value: hidden on the Resumen tab.
    await expect(page.getByText('Pago estimado del mes')).toHaveCount(0)
    // The assigned-client preview (fee mensual + estado de pago) never renders for
    // the self perspective: the Clientes tab shows client names only.
    await page.getByRole('tab', { name: 'Clientes' }).click()
    // Role-scoped heading: a plain getByText also matches the empty-state sentence
    // "Esta persona no tiene clientes asignados" (which contains this phrase), so it
    // would be ambiguous whenever the member has no assigned clients. The heading is
    // the stable anchor in both states; the money-absence checks below are the point.
    await expect(page.getByRole('heading', { name: 'Clientes asignados' })).toBeVisible()
    await expect(page.getByText('Fee mensual')).toHaveCount(0)
    await expect(page.getByText('Estado de pago')).toHaveCount(0)
  })
  test('manager still sees payroll on a member profile', async ({ page }) => {
    await applyRole(page, 'owner')
    await page.goto('/team?open=tm-mica', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('main')).toBeVisible()
    // Positive control: the manager perspective keeps the payroll surfaces intact,
    // so the privacy gate is perspective-scoped, not a global removal.
    await expect(page.getByRole('tab', { name: 'Pagos' })).toBeVisible()
    // `exact` (case-sensitive, whole-string) pins this to the detail SummaryCard
    // label. A loose match also hits the owner-only roster KPI hint ("pago estimado
    // del mes", lowercase), which stays co-mounted with the detail while the
    // master-detail split transitions in — two matches, strict-mode violation.
    await expect(page.getByText('Pago estimado del mes', { exact: true })).toBeVisible()
  })
})

test.describe('employee: clientes self-work-log', () => {
  // BLOCKED on the client↔team assignments domain, which is not yet wired to the API:
  // `dtoToClient` defaults `assignedTeam: []` (documented gap), and the employee
  // clients view filters to clients where `assignedTeam` includes the signed-in member
  // (clients-page.tsx). With no assignment source, the employee sees zero clients, so
  // there is no per-row "Cargar trabajo" to exercise. Restore (drop `.fixme`) once
  // assignments are wired and the fixture can seed an assigned client.
  test.fixme('employee logs their own work against an assigned client from the roster', async ({ page }) => {
    await applyRole(page, 'employee')
    await page.goto('/clients', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('main')).toBeVisible()
    // The roster stays money-free + manager-action-free for the Equipo.
    await expect(page.getByRole('button', { name: 'Registrar pago' })).toHaveCount(0)
    await expect(page.getByRole('columnheader', { name: 'Fee mensual' })).toHaveCount(0)
    // The per-row Cargar self-action opens the work-log menu.
    await page.getByRole('button', { name: 'Cargar trabajo' }).first().click()
    await page.getByRole('menuitem', { name: 'Cargar horas' }).click()
    // The dialog opens with the member fixed to the signed-in employee (no Persona
    // picker), and submitting fires the shared mutation's success toast.
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel('Persona')).toHaveCount(0)
    await dialog.getByLabel('Horas').fill('3')
    await dialog.getByRole('button', { name: 'Cargar horas' }).click()
    await expect(page.getByText('Horas registradas')).toBeVisible()
  })
})

test.describe('employee: client creation is gated', () => {
  /**
   * The API already refuses an employee's `POST /clients` (`requireRole('owner','admin')`),
   * so this pins the FRONT to the same contract: an employee must never be offered a
   * create affordance that the server will 403. Both entry points are covered — the
   * in-page CTA and the `?new` deep-link the global launcher uses.
   *
   * Every assertion here is an ABSENCE, which an unresolved page satisfies for free: the
   * create affordances only exist once the roster fetch lands, so asserting "count 0"
   * against the frame before `ClientsPage` has even mounted green-washes the very bug the
   * spec exists to catch — measured, it did, three times green on the broken code.
   * `settled` is therefore not politeness: it waits for a POSITIVE marker of the resolved
   * roster, so the absence is asserted against the FINAL DOM.
   *
   * Waiting for "no skeletons" is NOT equivalent and does not work: that is another
   * absence, and the shell paints `<main>` before the page mounts, so it is satisfied
   * before a single skeleton exists.
   *
   * The marker tolerates BOTH resolved branches on purpose. The employee's roster is empty
   * today only because client↔team assignments are not wired (`dtoToClient` defaults
   * `assignedTeam: []`), which is the same accident that hid the bug this spec pins. Once
   * they are wired — the `test.fixme` above is waiting for exactly that — the employee
   * gets rows and the empty state disappears; anchoring on the empty state alone would
   * then time out and read as a regression of a gate that is still intact.
   *
   * Queried by CSS, not by role: with the `?new` dialog open Radix marks the background
   * `aria-hidden`, which hides an ARIA query but leaves the element CSS-visible.
   */
  async function settled(page: Page): Promise<void> {
    // Empty/error state heading | desktop table | mobile card list.
    const resolved = page.locator(
      'main h2, main [data-slot="table"], main [data-slot="table-container"] ul',
    )
    await expect(resolved.first()).toBeVisible()
  }

  test('employee is offered no "Nuevo cliente" affordance', async ({ page }) => {
    await applyRole(page, 'employee')
    await page.goto('/clients', { waitUntil: 'domcontentloaded' })
    await settled(page)
    await expect(page.getByRole('button', { name: 'Nuevo cliente' })).toHaveCount(0)
  })

  test('employee cannot open the create dialog via the ?new deep link', async ({ page }) => {
    await applyRole(page, 'employee')
    await page.goto('/clients?new=1', { waitUntil: 'domcontentloaded' })
    await settled(page)
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  /**
   * Positive controls: the gate is role-scoped, not a removal of the affordance. BOTH
   * manager roles are pinned because the server allows both (`requireRole('owner','admin')`)
   * — without the admin case, tightening the gate to `role !== 'owner'` would silently
   * strip a capability the API still grants, and every spec here would stay green.
   *
   * No `settled` — `toBeVisible` is itself the positive wait.
   */
  for (const role of ['owner', 'admin'] as const) {
    test(`${role} still is offered "Nuevo cliente"`, async ({ page }) => {
      await applyRole(page, role)
      await page.goto('/clients', { waitUntil: 'domcontentloaded' })
      await expect(page.getByRole('button', { name: 'Nuevo cliente' }).first()).toBeVisible()
    })
  }
})

test.describe('employee: Nuevo self-create', () => {
  /**
   * Scoped to the widths where the SideNav rail is ON SCREEN, and that is a deliberate
   * gap, not a green-washed skip. Spelling it out so nobody "fixes" it back:
   *
   * WHAT THESE COVER: the launcher's items deep-link to `/team?new=<token>` and open the
   * matching self-dialog. That is routing + dialog logic — identical at every width — so
   * running it on three viewports adds no signal, only surface.
   *
   * WHY MOBILE IS EXCLUDED: below the nav breakpoint the rail collapses into an
   * off-canvas drawer, and its controls keep a real bounding box while it is closed (the
   * launcher measures at x = -231 on an iPhone 13). Playwright resolves it, calls it
   * "visible", then spins out the timeout trying to scroll a position-fixed off-canvas
   * node into view — reported as "element is not stable", which is a red herring: the box
   * never moves, it is simply outside the viewport. Driving the drawer open first does
   * work, but flakes ~1 in 12: the drawer rides a `translate-x`, and a transformed
   * ancestor makes its `fixed` children behave like `absolute` ones, so any scroll
   * Playwright decides to do drags it back out from under the click.
   *
   * THIS IS NOT A PRODUCT BUG — verified. The same specs fail on CHROMIUM at the iPhone
   * 13 viewport, so it is viewport-driven, not a WebKit quirk; and on mobile the drawer
   * opens and the launcher works when a human taps it.
   *
   * KNOWN GAP: the mobile path (tap ☰ → Nuevo → item) has NO e2e coverage. It went
   * unnoticed for so long because the `tablet` and `mobile` Playwright projects run in NO
   * workflow — `ci.yml` runs money-flows on chromium, and `role-walkthrough.yml` installs
   * and runs chromium only. Worth a stable mobile spec if the drawer's geometry is ever
   * made scroll-proof.
   */
  /**
   * 768 is Tailwind's `md`, and it is not a guess: the shell's mobile nav pill is
   * `md:hidden` (app-shell.tsx) and the rail sizes itself from `md:w-[clamp(…)]`
   * (side-nav.tsx), so `md` IS the nav breakpoint. `theme.css` only customizes
   * `--breakpoint-desktop`, leaving `md` at its 768px default.
   *
   * A describe-level skip condition is sync over fixtures, so it cannot probe the DOM
   * for the rail's real position — the width is the only lever available. That makes
   * this a copy of a CSS value with no mechanical link back to it: if the nav
   * breakpoint ever moves, update this number, or tablet silently starts running
   * against a closed drawer and these go red again.
   */
  test.skip(
    ({ viewport }) => (viewport?.width ?? Number.MAX_SAFE_INTEGER) < 768,
    'the SideNav rail is an off-canvas drawer below md — see the comment above',
  )

  // The rail "Nuevo" launcher gives the employee a disjoint self-create set; each
  // item deep-links to /team?new=<token> and opens the matching self-dialog.
  const ITEMS = [
    { item: 'Cargar horas', title: 'Cargar horas' },
    { item: 'Cargar viático', title: 'Cargar viático' },
    { item: 'Cargar extra', title: 'Cargar trabajo extra' },
  ]
  for (const { item, title } of ITEMS) {
    test(`Nuevo → ${item} opens its dialog on /team`, async ({ page }) => {
      await applyRole(page, 'employee')
      await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
      await expect(page.locator('main')).toBeVisible()
      await page.getByRole('button', { name: 'Nuevo' }).click()
      await page.getByRole('menuitem', { name: item }).click()
      // Lands on /team (param stripped) with the matching self-dialog open.
      await expect.poll(() => new URL(page.url()).pathname).toBe('/team')
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await expect(dialog.getByRole('heading', { name: title })).toBeVisible()
    })
  }
})

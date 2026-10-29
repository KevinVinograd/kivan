import { test, expect, type Page } from '@playwright/test'
import { applyRole, type Role } from './fixtures/role'

type Access = 'allowed' | 'blocked'
type Hook = { task: string; route: string; access: Access }

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
    { task: 'Review collections', route: '/cobros', access: 'allowed' },
    { task: 'Review account ledger', route: '/cuentas-corrientes', access: 'allowed' },
  ],
  employee: [
    { task: 'See my dashboard', route: '/dashboard', access: 'allowed' },
    { task: 'Work assigned clients', route: '/clients', access: 'allowed' },
    { task: 'Blocked: operation hub', route: '/operacion-mensual', access: 'blocked' },
    { task: 'Blocked: reports', route: '/reports', access: 'blocked' },
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
        await page.goto(hook.route, { waitUntil: 'domcontentloaded' })

        if (hook.access === 'allowed') {
          await expect(page.locator('main')).toBeVisible()
          expect(pathnameOf(page.url())).toBe(hook.route)
        } else {
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
    await expect(page.getByRole('button', { name: 'Cargar' }).first()).toBeVisible()
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
    await expect(page.getByRole('tab', { name: 'Pagos' })).toHaveCount(0)
    await expect(page.getByText('Pago estimado del mes')).toHaveCount(0)
    await page.getByRole('tab', { name: 'Clientes' }).click()
    await expect(page.getByRole('heading', { name: 'Clientes asignados' })).toBeVisible()
    await expect(page.getByText('Fee mensual')).toHaveCount(0)
    await expect(page.getByText('Estado de pago')).toHaveCount(0)
  })
  test('manager still sees payroll on a member profile', async ({ page }) => {
    await applyRole(page, 'owner')
    await page.goto('/team?open=tm-mica', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('main')).toBeVisible()
    await expect(page.getByRole('tab', { name: 'Pagos' })).toBeVisible()
    await expect(page.getByText('Pago estimado del mes', { exact: true })).toBeVisible()
  })
})

test.describe('employee: clientes self-work-log', () => {
  test.fixme('employee logs their own work against an assigned client from the roster', async ({ page }) => {
    await applyRole(page, 'employee')
    await page.goto('/clients', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('main')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Registrar pago' })).toHaveCount(0)
    await expect(page.getByRole('columnheader', { name: 'Fee mensual' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Cargar trabajo' }).first().click()
    await page.getByRole('menuitem', { name: 'Cargar horas' }).click()
    const dialog = page.getByRole('dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByLabel('Persona')).toHaveCount(0)
    await dialog.getByLabel('Horas').fill('3')
    await dialog.getByRole('button', { name: 'Cargar horas' }).click()
    await expect(page.getByText('Horas registradas')).toBeVisible()
  })
})

test.describe('employee: client creation is gated', () => {
  async function settled(page: Page): Promise<void> {
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

  for (const role of ['owner', 'admin'] as const) {
    test(`${role} still is offered "Nuevo cliente"`, async ({ page }) => {
      await applyRole(page, role)
      await page.goto('/clients', { waitUntil: 'domcontentloaded' })
      await expect(page.getByRole('button', { name: 'Nuevo cliente' }).first()).toBeVisible()
    })
  }
})

test.describe('employee: Nuevo self-create', () => {
  test.skip(
    ({ viewport }) => (viewport?.width ?? Number.MAX_SAFE_INTEGER) < 768,
    'the SideNav rail is an off-canvas drawer below md — see the comment above',
  )

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
      await expect.poll(() => new URL(page.url()).pathname).toBe('/team')
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await expect(dialog.getByRole('heading', { name: title })).toBeVisible()
    })
  }
})

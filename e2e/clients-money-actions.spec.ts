import { test, expect, type Page } from '@playwright/test'

import { applyRole } from './fixtures/role'
import { stubRoute } from './fixtures/api-mock'

const CLIENT = { id: 'cli-1', name: 'Estudio Uno' }
const PERIOD = `${new Date().toISOString().slice(0, 7)}-01`

function receivable(over: Record<string, unknown> = {}) {
  return {
    id: 'rec-1',
    clientId: CLIENT.id,
    clientName: CLIENT.name,
    businessName: null,
    taxId: null,
    contactName: null,
    period: PERIOD,
    service: 'Gestión mensual',
    baseAmountMinor: '45000000',
    extraAmountMinor: '0',
    discountAmountMinor: '0',
    totalAmountMinor: '45000000',
    collectedAmountMinor: '0',
    outstandingMinor: '45000000',
    currency: 'ARS',
    dueDate: '2099-12-31',
    collectedAt: null,
    status: 'pending',
    billingStatus: 'no_invoice',
    emitterId: null,
    emitterCode: 'monotributo_1',
    invoiceNumber: null,
    cae: null,
    invoiceIssuedAt: null,
    reviewStatus: null,
    effectiveDate: null,
    planNotes: null,
    extras: [],
    version: 0,
    createdAt: '2026-07-01T00:00:00.000Z',
    ...over,
  }
}

async function openClients(page: Page) {
  await page.goto('/clients', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('main')).toBeVisible()
}

const clientRow = (page: Page) => page.getByRole('row').filter({ hasText: CLIENT.name })

async function openRowMenu(page: Page) {
  await clientRow(page).getByRole('button', { name: /Acciones/ }).click()
}

test('the row shows what the cobro says, not the contracted fee', async ({ page }) => {
  await applyRole(page, 'owner', { receivables: [receivable()] })
  await openClients(page)

  await expect(clientRow(page).getByText('$ 450.000')).toBeVisible()
})

test('a client with no cobro this month says so instead of showing a balance', async ({ page }) => {
  await applyRole(page, 'owner', { receivables: [] })
  await openClients(page)

  const row = clientRow(page)
  await expect(row).toBeVisible()
  expect(await row.getByText('Pendiente', { exact: true }).count()).toBe(0)
  expect(await row.getByText('Sin registro').count()).toBeGreaterThan(0)

  await openRowMenu(page)
  await page.getByRole('menuitem', { name: 'Registrar pago' }).click()
  await expect(page.getByRole('alertdialog').getByText('Sin cobro este mes')).toBeVisible()
})

test('a failed collect keeps the dialog open and never toasts success', async ({ page }) => {
  await applyRole(page, 'owner', { receivables: [receivable()] })
  await stubRoute(page, '/receivables/*/collect', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'boom' }) }),
  )

  await openClients(page)
  await openRowMenu(page)
  await page.getByRole('menuitem', { name: 'Registrar pago' }).click()

  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Registrar cobro' }).click()

  await expect(page.getByText('No se pudo registrar el cobro')).toBeVisible()
  await expect(dialog).toBeVisible()
  expect(await page.getByText('Cobro registrado').count()).toBe(0)
})

test('a successful collect toasts the amount and closes', async ({ page }) => {
  await applyRole(page, 'owner', { receivables: [receivable()] })
  await stubRoute(page, '/receivables/*/collect', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(receivable({ collectedAmountMinor: '45000000', outstandingMinor: '0', status: 'collected' })),
    }),
  )

  await openClients(page)
  await openRowMenu(page)
  await page.getByRole('menuitem', { name: 'Registrar pago' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Registrar cobro' }).click()

  await expect(page.getByText('Cobro registrado')).toBeVisible()
  await expect(page.getByRole('dialog')).not.toBeVisible()
})

test('several cobros in the month force the choice instead of picking one', async ({ page }) => {
  await applyRole(page, 'owner', {
    receivables: [
      receivable({ id: 'rec-1', service: 'Gestión mensual' }),
      receivable({ id: 'rec-2', service: 'Paid media', totalAmountMinor: '12000000' }),
    ],
  })

  await openClients(page)
  await openRowMenu(page)
  await page.getByRole('menuitem', { name: 'Registrar pago' }).click()

  const picker = page.getByRole('dialog')
  await expect(picker.getByText('Elegí sobre qué cobro se registra.')).toBeVisible()
  await expect(picker.getByRole('button', { name: /Gestión mensual/ })).toBeVisible()
  await expect(picker.getByRole('button', { name: /Paid media/ })).toBeVisible()
})

test('generating a factura names the emisor it will issue from', async ({ page }) => {
  await applyRole(page, 'owner', { receivables: [receivable()] })

  await openClients(page)
  await openRowMenu(page)
  await page.getByRole('menuitem', { name: 'Emitir factura' }).click()

  await expect(page.getByRole('alertdialog').getByText(/Monotributo Vicky/)).toBeVisible()
  await expect(page.getByRole('alertdialog').getByText(/emitidos este mes/)).toBeVisible()
})

test('with no emisor able to issue, the factura is refused rather than misrouted', async ({ page }) => {
  await applyRole(page, 'owner', {
    receivables: [receivable()],
    emitters: [
      {
        id: '00000000-0000-4000-8000-0000000000e1',
        code: 'monotributo_1',
        label: 'Monotributo Vicky',
        cuit: '27-30123456-4',
        puntoDeVenta: 1,
        connected: true,
        monthlyLimitMinor: '100000000',
        annualLimitMinor: '6000000000',
        monthIssuedMinor: '100000000',
      },
    ],
  })

  await openClients(page)
  await openRowMenu(page)
  await page.getByRole('menuitem', { name: 'Emitir factura' }).click()

  const dialog = page.getByRole('alertdialog')
  await expect(dialog.getByText(/Ningún monotributo puede emitir/)).toBeVisible()
  expect(await dialog.getByRole('button', { name: 'Generar' }).count()).toBe(0)
})

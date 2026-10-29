import { test, expect, type Page } from '@playwright/test'

import { applyRole } from './fixtures/role'
import type { ReceivableDto } from '@/api/receivables'
import type { PaymentDto } from '@/api/payments'

const now = new Date()
const pad = (value: number) => String(value).padStart(2, '0')
const PERIOD = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`
const dayInPeriod = (day: number) => `${PERIOD.slice(0, 8)}${pad(day)}`

function receivable(over: Partial<ReceivableDto>): ReceivableDto {
  return {
    id: 'rec-1',
    clientId: 'cli-1',
    clientName: 'Estudio Uno',
    businessName: null,
    taxId: null,
    contactName: null,
    period: PERIOD,
    service: 'Fee mensual',
    baseAmountMinor: '15000000',
    extraAmountMinor: '0',
    discountAmountMinor: '0',
    totalAmountMinor: '15000000',
    collectedAmountMinor: '0',
    outstandingMinor: '15000000',
    currency: 'ARS',
    dueDate: dayInPeriod(10),
    status: 'pending',
    billingStatus: 'pending',
    emitterId: null,
    emitterCode: null,
    invoiceNumber: null,
    cae: null,
    invoiceIssuedAt: null,
    reviewStatus: null,
    effectiveDate: null,
    planNotes: null,
    extras: [],
    version: 1,
    createdAt: `${PERIOD}T00:00:00.000Z`,
    ...over,
  } as ReceivableDto
}

function payment(over: Partial<PaymentDto>): PaymentDto {
  return {
    id: 'pay-1',
    period: PERIOD,
    recipientType: 'collaborator',
    recipientId: 'tm-mica',
    recipientName: 'Micaela Duarte',
    concept: 'Honorarios',
    totalAmountMinor: '8000000',
    paidAmountMinor: '0',
    outstandingMinor: '8000000',
    currency: 'ARS',
    dueDate: dayInPeriod(15),
    status: 'pending',
    createdAt: `${PERIOD}T00:00:00.000Z`,
    ...over,
  } as unknown as PaymentDto
}

const SEED = {
  receivables: [
    receivable({ id: 'rec-1', status: 'pending', billingStatus: 'pending' }),
    receivable({
      id: 'rec-2',
      clientId: 'cli-2',
      clientName: 'Estudio Dos',
      status: 'overdue',
      billingStatus: 'issued',
      dueDate: '2026-05-02',
      totalAmountMinor: '9000000',
      outstandingMinor: '9000000',
    }),
    receivable({
      id: 'rec-3',
      status: 'collected',
      billingStatus: 'issued',
      collectedAmountMinor: '15000000',
      outstandingMinor: '0',
    }),
  ],
  payments: [
    payment({ id: 'pay-1', status: 'pending' }),
    payment({ id: 'pay-2', status: 'paid', paidAmountMinor: '8000000', outstandingMinor: '0' }),
    payment({
      id: 'pay-3',
      recipientType: 'fixed_expense',
      recipientName: 'Alquiler',
      concept: 'Alquiler',
      status: 'pending',
    }),
  ],
}

const drawer = (page: Page) => page.locator('[data-slot="sheet-content"]')

const drawerHeading = (page: Page, name: string) =>
  drawer(page).getByRole('heading', { name }).nth(1)

async function gotoReports(page: Page, query = '', opensDrawer = false): Promise<void> {
  await page.goto(`/reports${query}`)
  if (opensDrawer) {
    await expect(drawer(page)).toBeVisible()
    return
  }
  await expect(page.getByRole('heading', { name: 'Reportes', exact: true }).first()).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Resumen' })).toBeVisible()
}

async function openTab(page: Page, name: string): Promise<void> {
  await page.getByRole('tab', { name }).click()
  await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true')
}

async function expandCard(page: Page, title: string | RegExp): Promise<void> {
  const trigger = page.getByRole('button', { name: title }).first()
  if ((await trigger.getAttribute('aria-expanded')) === 'false') await trigger.click()
  await expect(trigger).toHaveAttribute('aria-expanded', 'true')
}

test('1. Resumen: names open the entity drawers, and hover reveals nothing', async ({ page }) => {
  await applyRole(page, 'owner', SEED)
  await gotoReports(page)

  await expandCard(page, /Clientes con riesgo/)
  const clientLink = page.locator('table').first().locator('tbody tr').first().getByRole('button').first()
  const clientName = (await clientLink.textContent())?.trim() ?? ''

  await clientLink.hover()
  await page.waitForTimeout(900)
  await expect(drawer(page)).toHaveCount(0)
  await expect(page.locator('[data-slot="hover-card-content"]')).toHaveCount(0)
  console.log(`[1] hover over "${clientName}" -> no hover-card, no drawer`)

  await clientLink.click()
  await expect(drawerHeading(page, clientName)).toBeVisible()
  await expect(drawer(page).getByText('Comparativa · Margen')).toBeVisible()
  await expect(page).toHaveURL(/open=client(%3A|:)/)
  console.log(`[1] click "${clientName}" -> Cliente drawer with the margin cohort chart`)

  await drawer(page).getByRole('button', { name: 'Cerrar detalle' }).click()
  await expect(drawer(page)).toHaveCount(0)

  await expandCard(page, /Equipo con mayor carga/)
  const personLink = page.locator('table').nth(1).locator('tbody tr').first().getByRole('button').first()
  const personName = (await personLink.textContent())?.trim() ?? ''
  await personLink.click()
  await expect(drawerHeading(page, personName)).toBeVisible()
  await expect(drawer(page).getByText('Comparativa · Utilización')).toBeVisible()
  await expect(page).toHaveURL(/open=person(%3A|:)/)
  console.log(`[1] click "${personName}" -> Persona drawer with the utilization cohort chart`)
})

test('2. Productividad: a carga row opens the PERSON, not the task', async ({ page }) => {
  await applyRole(page, 'owner', SEED)
  await gotoReports(page)
  await openTab(page, 'Productividad')
  await expandCard(page, /Detalle de cargas/)

  const firstRow = page.locator('tbody tr').first()
  const cells = await firstRow.locator('td').allInnerTexts()
  await firstRow.click()
  await expect(drawer(page)).toBeVisible()
  const title = (await drawer(page).getByRole('heading').nth(1).textContent())?.trim()
  await expect(page).toHaveURL(/open=person(%3A|:)/)
  await expect(drawer(page).getByText('Comparativa · Utilización')).toBeVisible()
  expect(cells.join(' | ')).toContain(title)
  console.log(`[2] row = ${JSON.stringify(cells.slice(0, 3))} -> drawer "${title}" (the person)`)
})

test('3. Carga de equipo: a row opens Persona, with Costo del período for the owner', async ({ page }) => {
  await applyRole(page, 'owner', SEED)
  await gotoReports(page)
  await openTab(page, 'Carga de equipo')

  await page.locator('tbody tr').first().click()
  await expect(drawer(page)).toBeVisible()
  await expect(drawer(page).getByText('Costo del período')).toBeVisible()
  await expect(drawer(page).getByText('Comparativa · Utilización')).toBeVisible()
  await expect(page).toHaveURL(/open=person(%3A|:)/)
  console.log('[3] Carga row -> Persona drawer with "Costo del período"')
})

test('4. Rentabilidad: a row opens Cliente with the portfolio comparison', async ({ page }) => {
  await applyRole(page, 'owner', SEED)
  await gotoReports(page)
  await openTab(page, 'Rentabilidad')

  await page.locator('tbody tr').first().click()
  await expect(drawer(page)).toBeVisible()
  await expect(drawer(page).getByText('Comparativa · Margen')).toBeVisible()
  await expect(drawer(page).getByText(/Posición \d+ de \d+/)).toBeVisible()
  await expect(page).toHaveURL(/open=client(%3A|:)/)
  const rank = await drawer(page).getByText(/Posición \d+ de \d+/).textContent()
  console.log(`[4] Rentabilidad row -> Cliente drawer, "${rank?.trim()}"`)
})

test('5. Finanzas: a donut slice opens Estado; an accordion row opens its record IN PLACE, read-only', async ({
  page,
}) => {
  await applyRole(page, 'owner', SEED)
  await gotoReports(page)
  await openTab(page, 'Finanzas operativas')

  const slice = page.locator('.recharts-pie-sector, .recharts-sector').first()
  await expect(slice).toBeVisible()
  await slice.click({ force: true })
  await expect(drawer(page)).toBeVisible()
  await expect(page).toHaveURL(/open=bucket(%3A|:)cobros-/)
  const title = (await drawer(page).getByRole('heading').nth(1).textContent())?.trim()
  await expect(drawer(page).getByText('Antigüedad')).toBeVisible()
  await expect(drawer(page).getByText('Concentración')).toBeVisible()
  console.log(`[5] donut slice -> Estado drawer "${title}" with Antigüedad + Concentración`)

  await drawer(page).getByRole('button', { name: 'Cerrar detalle' }).click()
  await expect(drawer(page)).toHaveCount(0)

  await expandCard(page, /^Cobros por estado/)
  const row = page
    .locator(
      'table[aria-label="Cobros por estado"] tbody tr, ul[aria-label="Cobros por estado"] li [role="button"]',
    )
    .first()
  await expect(row).toBeVisible()
  await row.click()

  await expect(drawer(page)).toBeVisible()
  await expect(page).toHaveURL(/\/reports\?/)
  await expect(page).toHaveURL(/open=receivable(%3A|:)/)

  for (const label of [/Generar factura/, /Marcar cobrado/, /Asociar factura/, /Editar datos fiscales/]) {
    await expect(drawer(page).getByRole('button', { name: label })).toHaveCount(0)
  }
  await expect(drawer(page).getByRole('button', { name: 'Ver en Cobros' })).toBeVisible()
  console.log('[5] accordion record row -> in-place drawer, read-only, with a "Ver en Cobros" escape')

  await drawer(page).getByRole('button', { name: 'Cerrar detalle' }).click()
  await expect(drawer(page)).toHaveCount(0)

  const table = page.locator('table[aria-label="Cobros por estado"]')
  const trigger = (await table.count())
    ? table.locator('tbody tr').first().getByRole('button').first()
    : page.locator('ul[aria-label="Cobros por estado"] li [role="button"]').first()

  await trigger.focus()
  await expect(trigger).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(drawer(page)).toBeVisible()
  await expect(page).toHaveURL(/open=receivable(%3A|:)/)
  console.log('[5] the record row is reachable and openable by KEYBOARD')
})

test('6. Deep-link survives a reload; browser Back closes the drawer and stays on /reports', async ({
  page,
}) => {
  await applyRole(page, 'owner', SEED)
  await gotoReports(page, '?tab=carga&open=person%3Atm-sol', true)
  await expect(drawerHeading(page, 'Sol Ramírez')).toBeVisible()
  console.log('[6] reload of ?open=person:tm-sol -> Persona drawer for Sol Ramírez')

  await drawer(page).getByRole('button', { name: 'Cerrar detalle' }).click()
  await expect(drawer(page)).toHaveCount(0)
  await page.locator('tbody tr').first().click()
  await expect(drawer(page)).toBeVisible()
  await page.goBack()
  await expect(drawer(page)).toHaveCount(0)
  await expect(page).toHaveURL(/\/reports/)
  expect(new URL(page.url()).searchParams.get('open')).toBeNull()
  console.log('[6] browser Back -> drawer closed, still on /reports, ?open= dropped')
})

test('7. A stale or cross-kind ?open= never opens a drawer, and a tab switch drops it', async ({
  page,
}) => {
  await applyRole(page, 'owner', SEED)

  await gotoReports(page, '?tab=carga&open=client%3Acl-cafe-roma')
  await expect(drawer(page)).toHaveCount(0)
  console.log('[7a] ?tab=carga&open=client:… -> wrong kind for the tab, no drawer')

  await gotoReports(page, '?tab=carga&open=person%3Atm-ghost')
  await expect(drawer(page)).toHaveCount(0)
  console.log('[7b] ?open=person:tm-ghost -> unknown id, no drawer')

  await gotoReports(page, '?tab=carga&open=tm-sol')
  await expect(drawer(page)).toHaveCount(0)
  console.log('[7c] ?open=tm-sol -> no kind discriminant, no drawer')

  await gotoReports(page, '?tab=carga&open=person%3Atm-sol', true)
  await drawer(page).getByRole('button', { name: 'Cerrar detalle' }).click()
  await expect(drawer(page)).toHaveCount(0)
  await openTab(page, 'Productividad')
  expect(new URL(page.url()).searchParams.get('open')).toBeNull()
  await expect(drawer(page)).toHaveCount(0)
  console.log('[7d] close -> switch tab -> ?open= dropped, no drawer')
})

test('8. Below 1024px the same drawer resolves to a bottom sheet, with no call-site branch', async ({
  page,
}) => {
  await applyRole(page, 'owner', SEED)
  await page.setViewportSize({ width: 1280, height: 800 })
  await gotoReports(page, '?tab=carga&open=person%3Atm-sol', true)
  await expect(drawer(page)).toHaveAttribute('data-side', 'right')
  console.log('[8] 1280px -> data-side=right')

  await page.setViewportSize({ width: 900, height: 800 })
  await expect(drawer(page)).toHaveAttribute('data-side', 'bottom')
  const box = await drawer(page).boundingBox()
  console.log(`[8] 900px -> data-side=bottom, box=${JSON.stringify(box)}`)
  expect(box!.width).toBeGreaterThanOrEqual(899)
  expect(Math.round(box!.y + box!.height)).toBeGreaterThanOrEqual(799)
})

test('9. Admin: the Persona drawer shows Costo del período and the money tabs — full parity with the owner', async ({
  page,
}) => {
  await applyRole(page, 'admin', SEED)
  await gotoReports(page, '?tab=carga&open=person%3Atm-sol', true)

  await expect(drawerHeading(page, 'Sol Ramírez')).toBeVisible()
  await expect(drawer(page).getByText('Comparativa · Utilización')).toBeVisible()
  await expect(drawer(page).getByText('Costo del período')).toBeVisible()
  console.log('[9] admin Persona drawer: comparison present, "Costo del período" shown (owner parity)')

  await drawer(page).getByRole('button', { name: 'Cerrar detalle' }).click()
  await expect(drawer(page)).toHaveCount(0)
  const tabs = await page.getByRole('tab').allInnerTexts()
  console.log(`[9] admin tabs (drawer closed) = ${JSON.stringify(tabs)}`)
  expect(tabs.length).toBeGreaterThan(0)
  expect(tabs.some((t) => /Rentabilidad/.test(t))).toBe(true)
  expect(tabs.some((t) => /Finanzas/.test(t))).toBe(true)
})

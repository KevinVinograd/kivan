import { test, expect, type Page } from '@playwright/test'

import { applyRole } from './fixtures/role'
import type { ReceivableDto } from '@/api/receivables'
import type { PaymentDto } from '@/api/payments'

/**
 * Reportes entity drawers — end-to-end guard.
 *
 * The three drill-ins (Persona / Cliente / Estado financiero) replaced a hover preview
 * and a row-shaped detail, and most of what changed is unreachable from a unit test:
 * that a Productividad row now opens the PERSON who logged it rather than the task, that
 * hovering a name reveals nothing at all any more, that the Finanzas accordion kept its
 * per-record deep-links while only the donut slice opens the bucket, and that the one
 * Sheet resolves to a bottom sheet below 1024px with no call-site branch. This drives all
 * of it in a real browser.
 */

/**
 * The month the seeded rows belong to: the one /reports actually OPENS on.
 *
 * It was the literal '2026-06-01'. That was fine while the page was pinned to June and
 * became wrong the moment the period selector started following the calendar — the rows
 * landed in a month the page was not showing, and the Finanzas tables came up empty. A spec
 * that hardcodes the month it seeds has the same shelf life as the code that hardcodes the
 * month it shows.
 */
const now = new Date()
const pad = (value: number) => String(value).padStart(2, '0')
const PERIOD = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`
/** A day inside PERIOD, for due dates and timestamps that must fall in the same month. */
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

/**
 * The drawer renders its accessible name TWICE: an sr-only SheetTitle (Radix needs it)
 * and the visible SectionHeader title. Match the visible one, or strict mode trips.
 */
const drawerHeading = (page: Page, name: string) =>
  drawer(page).getByRole('heading', { name }).nth(1)

async function gotoReports(page: Page, query = '', opensDrawer = false): Promise<void> {
  await page.goto(`/reports${query}`)
  if (opensDrawer) {
    // The drawer is MODAL: with it open, everything behind it is inert and leaves the
    // accessibility tree — including the page heading and the tab strip. A deep-linked
    // drawer must therefore be awaited on the Sheet itself, never on the page chrome.
    await expect(drawer(page)).toBeVisible()
    return
  }
  // The page title renders twice (the PageHeader dissolves in place and keeps a second
  // copy), so match the first rather than tripping strict mode.
  await expect(page.getByRole('heading', { name: 'Reportes', exact: true }).first()).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Resumen' })).toBeVisible()
}

async function openTab(page: Page, name: string): Promise<void> {
  await page.getByRole('tab', { name }).click()
  await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true')
}

/** Expand a collapsed disclosure card by its title. */
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

  // The hover-preview surface is gone: hovering must reveal nothing at all.
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

// Productividad (hours per task) is now backed by GET /reports/productivity (one row per
// logged TimeEntry). A carga row opens the PERSON who logged it, not the task — the same
// contract the Carga de equipo tab guards in test 3.
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
  // The drawer's title must be the PERSON in that row, not its task type.
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

  // The accordion rows are RECORDS, and they now open IN PLACE.
  //
  // This assertion used to be the exact opposite — that the rows deep-link OUT to /cobros and
  // /pagos. They did, and that was the defect: it threw the reader out of the report to answer
  // a question about a row of it, onto an operational page whose period control then covered
  // the record's own header on a phone. A drill-in is read AGAINST the aggregate it came from.
  // The contract changed deliberately, so the test that guarded the old one now guards the new
  // one — and guards MORE: that no money mutation and no period control came across with it.
  await expandCard(page, /^Cobros por estado/)
  // DetailTable renders two shapes for the same rows: a real <table> from `md` up, a list of
  // whole-row targets below it. This spec runs in both the desktop and the mobile project, so
  // the locator must find the row either way — matching only one of them is how a guard ends
  // up passing on a viewport it never actually looked at.
  const row = page
    .locator(
      'table[aria-label="Cobros por estado"] tbody tr, ul[aria-label="Cobros por estado"] li [role="button"]',
    )
    .first()
  await expect(row).toBeVisible()
  await row.click()

  await expect(drawer(page)).toBeVisible()
  await expect(page).toHaveURL(/\/reports\?/) // never left the page
  await expect(page).toHaveURL(/open=receivable(%3A|:)/)

  // The Finanzas tab is analytics, not an operate surface (:
  // "acceptable as aggregate analytics; do not let it grow operate-style actions"). The read
  // -only body cannot import these — this asserts that it never starts.
  for (const label of [/Generar factura/, /Marcar cobrado/, /Asociar factura/, /Editar datos fiscales/]) {
    await expect(drawer(page).getByRole('button', { name: label })).toHaveCount(0)
  }
  // The one way out, and it is explicit.
  await expect(drawer(page).getByRole('button', { name: 'Ver en Cobros' })).toBeVisible()
  console.log('[5] accordion record row -> in-place drawer, read-only, with a "Ver en Cobros" escape')

  await drawer(page).getByRole('button', { name: 'Cerrar detalle' }).click()
  await expect(drawer(page)).toHaveCount(0)

  // KEYBOARD — and it must be asserted on BOTH shapes, because they reach the record by
  // completely different means.
  //
  // Desktop is the fragile one. `TableRow interactive` adds `cursor-pointer` and NOTHING else
  // — no tabIndex, no role, no onKeyDown (table.tsx: "tables are reading surfaces, so a row
  // NEVER moves") — so a `<tr onClick>` is a MOUSE-ONLY target. The record's name in the first
  // cell is the entire keyboard path. It used to be an `<a>` because the row deep-linked out;
  // when the link became unnecessary the trigger nearly went with it, which would have
  // stranded every keyboard user on the page's densest table while nothing else failed.
  //
  // Mobile reaches it a different way: the whole row is a `role="button" tabIndex={0}`. Asserting
  // only the desktop shape would leave the mobile project passing a check it never ran.
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
  // Opening by click PUSHES a history entry, so browser Back must close the drawer.
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

  // The drawer is MODAL, so the tab strip behind it is inert — you cannot switch tabs
  // with a drawer open. The staleness guard is therefore reached by URL, not by click.

  // (a) A ref whose KIND the tab cannot open (a client on Carga de equipo) must not open.
  await gotoReports(page, '?tab=carga&open=client%3Acl-cafe-roma')
  await expect(drawer(page)).toHaveCount(0)
  console.log('[7a] ?tab=carga&open=client:… -> wrong kind for the tab, no drawer')

  // (b) A person id the dataset does not contain must not open.
  await gotoReports(page, '?tab=carga&open=person%3Atm-ghost')
  await expect(drawer(page)).toHaveCount(0)
  console.log('[7b] ?open=person:tm-ghost -> unknown id, no drawer')

  // (c) A malformed ref (no kind) must not open.
  await gotoReports(page, '?tab=carga&open=tm-sol')
  await expect(drawer(page)).toHaveCount(0)
  console.log('[7c] ?open=tm-sol -> no kind discriminant, no drawer')

  // (d) Switching tabs with NO drawer open must not carry an ?open= across.
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
  // Capability change 7a583af moved admin to full money parity with the owner: the studio's
  // own money (team cost, profitability, Finanzas) is now visible to admins, differing from
  // the owner only in governance. This test used to assert the opposite (money hidden from
  // admin) and was updated when that policy changed — the money is deliberately shown now.
  await applyRole(page, 'admin', SEED)
  await gotoReports(page, '?tab=carga&open=person%3Atm-sol', true)

  await expect(drawerHeading(page, 'Sol Ramírez')).toBeVisible()
  await expect(drawer(page).getByText('Comparativa · Utilización')).toBeVisible()
  await expect(drawer(page).getByText('Costo del período')).toBeVisible()
  console.log('[9] admin Persona drawer: comparison present, "Costo del período" shown (owner parity)')

  // Read the tab strip with the drawer CLOSED. While the modal drawer is open the page
  // behind it is inert and getByRole('tab') returns [] — which would pass this assertion
  // vacuously.
  await drawer(page).getByRole('button', { name: 'Cerrar detalle' }).click()
  await expect(drawer(page)).toHaveCount(0)
  const tabs = await page.getByRole('tab').allInnerTexts()
  console.log(`[9] admin tabs (drawer closed) = ${JSON.stringify(tabs)}`)
  expect(tabs.length).toBeGreaterThan(0)
  expect(tabs.some((t) => /Rentabilidad/.test(t))).toBe(true)
  expect(tabs.some((t) => /Finanzas/.test(t))).toBe(true)
})

import { test, expect, type Page } from '@playwright/test'
import { applyRole } from './fixtures/role'

const WIDTHS = [768, 1024, 1280, 1440]

type Box = { text: string; x: number; y: number; w: number; h: number }

async function textBoxes(page: Page): Promise<Box[]> {
  return page
    .locator('section[aria-label="Rentabilidad estimada"]')
    .locator('div:has(> span.type-caption) > span, svg text')
    .evaluateAll((elements) =>
      elements
        .map((element) => {
          const rect = element.getBoundingClientRect()
          return {
            text: (element.textContent ?? '').trim(),
            x: rect.x,
            y: rect.y,
            w: rect.width,
            h: rect.height,
          }
        })
        .filter((box) => box.w > 0 && box.h > 0),
    )
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

for (const width of WIDTHS) {
  test(`profitability tab: no text collides at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await applyRole(page, 'owner')
    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('main')).toBeVisible()

    await page.getByRole('tab', { name: /Margen estimado/ }).click()
    const section = page.locator('section[aria-label="Rentabilidad estimada"]')
    await expect(section).toBeVisible()

    await expect(section.getByText('Resultado estimado')).toBeVisible()
    const valueLabels = section.locator('.recharts-label-list text')
    await expect(valueLabels.first()).toBeVisible()

    const barCount = await section.locator('.recharts-bar-rectangle').count()
    await expect(valueLabels).toHaveCount(barCount)

    const boxes = await textBoxes(page)
    expect(boxes.length).toBeGreaterThan(10)

    const collisions: string[] = []
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        if (overlaps(boxes[i], boxes[j])) {
          collisions.push(`"${boxes[i].text}" ∩ "${boxes[j].text}"`)
        }
      }
    }
    expect(collisions, `text collisions at ${width}px`).toEqual([])
  })
}

test('profitability tab: the margin charts name their clients to assistive tech', async ({
  page,
}) => {
  await applyRole(page, 'owner')
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('main')).toBeVisible()
  await page.getByRole('tab', { name: /Margen estimado/ }).click()

  const best = page.getByRole('img', { name: /^Mejor margen:/ })
  await expect(best).toBeVisible()
  const label = (await best.getAttribute('aria-label')) ?? ''
  expect(label).toMatch(/%/)
  expect(label.split(',').length).toBeGreaterThan(1)
})

import { test, expect, type Page } from '@playwright/test'
import { applyRole } from './fixtures/role'

/**
 * Geometry guard for the owner dashboard's "Rentabilidad estimada" tab.
 *
 * This section is where `KpiSummaryCard`'s supporting grid actually broke: it sizes its
 * columns from the figure COUNT using VIEWPORT breakpoints (5 figures → 4 supporting →
 * `grid-cols-2 sm:grid-cols-4`), and `sm:` is always on at desktop — so in a card narrower
 * than the page it claimed four columns it did not have and the 32px figures collided. The
 * margin charts have the same failure mode from the other direction: a value label sits past
 * the tip of its bar, so on a narrow plot "-181%" lands on its own client's name.
 *
 * Neither failure is visible to a typecheck, a lint, a snapshot count or an
 * `expect(...).toBeVisible()` — they are PIXEL collisions between two elements that are both
 * perfectly "visible". So this measures: every text box in the section must be disjoint from
 * every other one, at every width where the layout changes shape.
 *
 * Both bugs this guards against were found BY this probe and are reproducible by reverting
 * the fixes: put the KPI card back in a `lg:grid-cols-3` row, or drop the label headroom in
 * `valueDomain`, and it goes red.
 */

/**
 * The widths where this layout changes shape, and therefore the only ones worth paying for:
 * `md` (768, the rail is out and the section narrows), `lg` (1024, the margin cards split
 * into two columns), `xl` (1280, `PanelGroup inlineAt="xl"` squeezes the section into ~2/3
 * of the main column — the NARROWEST the plots ever get, and where the label collision
 * actually happened), and desktop (1440).
 */
const WIDTHS = [768, 1024, 1280, 1440]

type Box = { text: string; x: number; y: number; w: number; h: number }

/** Every rendered text box in the section: the KPI spans AND the chart's SVG <text>. */
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
        // A zero-area box cannot collide with anything, and Recharts emits a few.
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

    // The KPI strip is a radio-tab group: selecting the margin tile swaps this section in.
    await page.getByRole('tab', { name: /Margen estimado/ }).click()
    const section = page.locator('section[aria-label="Rentabilidad estimada"]')
    await expect(section).toBeVisible()

    // Positive anchor before measuring — and it must anchor on the VALUE LABELS, not on the
    // bars. Recharts animates the bars in and only paints a `LabelList` when that animation
    // finishes, so a probe that waits for the first bar rectangle measures a chart whose
    // labels do not exist yet. The labels are the thing that collides; without them there is
    // nothing to collide and the spec passes on ANY geometry, broken included. This exact
    // trap green-washed the first version of this file, verified by reverting the fix.
    await expect(section.getByText('Resultado estimado')).toBeVisible()
    const valueLabels = section.locator('.recharts-label-list text')
    await expect(valueLabels.first()).toBeVisible()

    // One label per bar across both charts. Pinning the count means a future change that
    // silently stops rendering them fails here instead of quietly disarming the guard.
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

  // The charts replaced a readable <ul> of clients, and ChartContainer exposes a chart as a
  // single labelled image — so the label is the ONLY copy of this data a screen reader gets.
  // A bare "Mejor margen" would be a silent accessibility regression, which is what this pins.
  const best = page.getByRole('img', { name: /^Mejor margen:/ })
  await expect(best).toBeVisible()
  const label = (await best.getAttribute('aria-label')) ?? ''
  expect(label).toMatch(/%/)
  expect(label.split(',').length).toBeGreaterThan(1)
})

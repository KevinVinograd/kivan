import { type ReactNode } from 'react'

import { cn } from '@/app/lib/utils'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Card,
  CardContent,
} from '@/app/components/components'

/**
 * SectionAccordionCard — a titled, collapsible section rendered as its own card.
 *
 * The canonical "one accordion = one titled card" scaffold: a `Card` wrapping a
 * single-item `collapsible` `Accordion` whose trigger carries a section title
 * (`emphasis="section"`, the `type-section` treatment matching `SectionHeader`)
 * plus an optional collapsed `summary` on the right, and whose body is the
 * `children`. Each card is an independent accordion, so several stacked cards open
 * and close independently.
 *
 * It exists so the treasury Posición, the Reportes Finanzas detail, and the
 * Resumen disclosure cards share one authority instead of hand-rolling the same
 * Card + Accordion shape (taxonomy § 5.3, parallel-pattern drift). The horizontal
 * page inset is intentionally NOT owned here — the page layout provides it (per the
 * spacing-ownership model), so this card drops
 * cleanly into a `px-4 md:px-6 lg:px-8 desktop:px-10` column.
 */
export type SectionAccordionCardProps = {
  /** The section title, promoted to the `type-section` trigger label. */
  title: string
  /**
   * Optional collapsed-state summary shown right-aligned in the trigger, before
   * the chevron (e.g. per-lane totals, a count badge). Pin its own `type-*` so it
   * does not inherit the `type-section` title scale.
   */
  summary?: ReactNode
  /** The collapsible body. */
  children: ReactNode
  /**
   * Accordion item id. A stable default is fine — each card is its own Accordion
   * root, so the value only has to be unique within this one item.
   */
  value?: string
  /** Render the card open on first paint. Defaults to closed. */
  defaultOpen?: boolean
  /**
   * Horizontal inset of the body (maps to `AccordionContent inset`). `true`
   * (default) keeps the 8px L/R inset that aligns the body under the title; pass
   * `false` for an edge-to-edge table that fills the card width.
   */
  contentInset?: boolean
  /**
   * Drops the `summary` BELOW the title on a phone instead of beside it (`md` and up
   * is unchanged). Opt-in, for a summary that carries several lines: kept inline it
   * squeezes into a narrow trailing column, wraps to four stacked lines and drags the
   * title into wrapping too. Same style, same tokens — only the placement moves.
   *
   * Leave it off for a short summary (a count badge, one figure): those fit inline on a
   * phone, and stacking them would push the title's chevron off its own line for nothing.
   */
  stackSummaryOnMobile?: boolean
}

export function SectionAccordionCard({
  title,
  summary,
  children,
  value = 'section',
  defaultOpen = false,
  contentInset = true,
  stackSummaryOnMobile = false,
}: SectionAccordionCardProps) {
  return (
    <Card>
      <CardContent>
        <Accordion type="single" collapsible defaultValue={defaultOpen ? value : undefined}>
          <AccordionItem value={value}>
            <AccordionTrigger emphasis="section">
              <span
                className={cn(
                  'flex flex-1 items-center justify-between gap-4',
                  // Stacked: the title takes its own line and the summary sits under it,
                  // left-aligned (a trailing column's right alignment reads as an orphan
                  // once it is no longer trailing). Restored to the inline row at `md`.
                  stackSummaryOnMobile &&
                    'flex-col items-start gap-1 md:flex-row md:items-center md:gap-4',
                )}
              >
                <span>{title}</span>
                {summary}
              </span>
            </AccordionTrigger>
            <AccordionContent inset={contentInset}>{children}</AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  )
}

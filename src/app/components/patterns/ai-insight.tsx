import type { ReactNode } from "react"
import { Sparkle as SparklesIcon } from "@phosphor-icons/react"

import { cn } from "@/app/lib/utils"
import { Button, Card, CardContent } from "@/app/components/components"

export type AiInsightVariant = "ghost" | "prominent"

export type AiInsightProps = {
  /** The concise, page-relevant takeaway — the single most relevant line. */
  headline: ReactNode
  /** AI-provenance overline above the headline. Has a sensible default. */
  overline?: string
  /** Optional CTA label below the headline (directs to the resolution). */
  ctaLabel?: string
  /** Invoked when the CTA is pressed. Required for the CTA to render. */
  onCta?: () => void
  /**
   * Visual framing. `ghost` (default) blends into the panel; `prominent` paints
   * the Kivan emerald-on-surface AI gradient with dark full-contrast text.
   */
  variant?: AiInsightVariant
}

/**
 * AiInsight — a generic, domain-neutral AI-summary banner. Renders a small
 * AI-provenance overline (a solid sparkle) above one concise headline that
 * summarizes the most relevant of what the page is showing, with an optional
 * CTA that directs to the resolution. `ghost` (default) frames it in a
 * transparent Card so it blends into the panel; `prominent` paints the
 * `bg-gradient-ai-insight` emerald-on-surface shader (Kivan emerald glows over the
 * flat surface, theme-aware) with dark full-contrast text for a more eye-catching
 * banner. Domain-free: the consumer generates and passes the headline + CTA from
 * its own data.
 *
 * Non-table pattern in `patterns/`. Token-pure: composes `Card` (`variant="ghost"`)
 * or the governed `bg-gradient-ai-insight` utility + `Button` + typography.
 */
export function AiInsight({
  headline,
  overline = "Insight generada con IA · basada en esta página",
  ctaLabel,
  onCta,
  variant = "ghost",
}: AiInsightProps) {
  const body = (
    <>
      <div className="flex flex-col items-start gap-2">
        <span className="flex items-center gap-1.5 type-caption font-semibold fg-primary">
          <SparklesIcon className="size-3.5" fill="currentColor" aria-hidden />
          {overline}
        </span>
        <p
          className={cn(
            "max-w-[600px] type-section md:type-headline",
            variant === "prominent" ? "fg-high-contrast" : "fg-default",
          )}
        >
          {headline}
        </p>
      </div>
      {ctaLabel && onCta ? (
        <Button
          variant={variant === "prominent" ? "solid" : "outlined"}
          color="primary"
          onClick={onCta}
        >
          {ctaLabel}
        </Button>
      ) : null}
    </>
  )

  if (variant === "prominent") {
    return (
      // `shadow-subtle` lifts the banner off the page ground. It is the shadow the token
      // system already assigns to "dashboard summary widgets, content sections, subtle
      // containers" (Component bindings; § 3's decision tree
      // reaches the same answer — "a surface that needs slight separation from the
      // background"). Without it the banner reads as a coloured region OF the page rather
      // than a card ON it. The `ghost` variant below deliberately gets none: its surface is
      // transparent, and a shadow around nothing is a floating outline.
      <div className="flex flex-col items-start gap-4 rounded-container border border-alpha-subtle bg-gradient-ai-insight p-4 shadow-subtle">
        {body}
      </div>
    )
  }

  return (
    <Card variant="ghost">
      <CardContent className="flex flex-col items-start gap-4">{body}</CardContent>
    </Card>
  )
}

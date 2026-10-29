import type { ReactNode } from "react"
import { Sparkle as SparklesIcon } from "@phosphor-icons/react"

import { cn } from "@/app/lib/utils"
import { Button, Card, CardContent } from "@/app/components/components"

export type AiInsightVariant = "ghost" | "prominent"

export type AiInsightProps = {
  headline: ReactNode
  overline?: string
  ctaLabel?: string
  onCta?: () => void
  variant?: AiInsightVariant
}

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

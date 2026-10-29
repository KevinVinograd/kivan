import { Toaster as Sonner, toast, type ToasterProps } from "sonner"

import { cn } from "@/app/lib/utils"
import { useTheme } from "@/app/lib/use-theme"

function Toaster({ className, ...props }: ToasterProps) {
  const { theme } = useTheme()

  return (
    <Sonner
      theme={theme}
      className={cn(
        "toaster group",
        "[--normal-bg:var(--color-surface-flat)]",
        "[--normal-text:var(--color-fg-default)]",
        "[--normal-border:var(--color-border-alpha-subtle)]",
        "[--border-radius:var(--radius-container)]",
        className,
      )}
      {...props}
    />
  )
}

export { Toaster, toast }

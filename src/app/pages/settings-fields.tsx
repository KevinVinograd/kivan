import { useId, type ReactNode } from 'react'

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Switch,
} from '@/app/components/components'

/**
 * Shared form primitives for the Configuración sections. These are page-scoped
 * helpers (they live under `pages/`, not `components/`), so each settings
 * section composes the same labelled-field, titled-group and toggle-row idioms
 * without repeating the markup seven times. They wrap approved components only
 * (Card, Switch) and own no business logic.
 */

/** Labelled field: a caption label stacked above its control. Mirrors the
 *  `Field` idiom used across the page dialogs. */
export function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor?: string
  children: ReactNode
}) {
  return (
    <label htmlFor={htmlFor} className="flex flex-col gap-1.5">
      <span className="type-caption fg-subtle">{label}</span>
      {children}
    </label>
  )
}

/** A titled settings group rendered as an outlined Card. Groups related controls
 *  under a heading inside a section's PanelContent. */
export function SettingGroup({
  title,
  description,
  action,
  children,
}: {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <Card variant="default">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
        {action ? <CardAction>{action}</CardAction> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  )
}

/** A label/description on the left and a Switch on the right — the row used for
 *  boolean preferences (notifications, operation flags, methods of cobro). */
export function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string
  description?: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div className="flex items-start justify-between gap-4">
      <label htmlFor={id} className="flex min-w-0 flex-col gap-0.5">
        <span className="type-body-2 fg-default">{label}</span>
        {description ? <span className="type-caption fg-subtle">{description}</span> : null}
      </label>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className="mt-0.5 shrink-0"
      />
    </div>
  )
}

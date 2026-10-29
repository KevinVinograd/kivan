import { useCallback, useRef, useState } from 'react'

import { Checkbox } from '@/app/components/components'

export function useKeepOpen() {
  const [keepOpen, setKeepOpen] = useState(false)
  const fieldsRef = useRef<HTMLDivElement>(null)

  const focusFirstField = useCallback((label?: string) => {
    requestAnimationFrame(() => {
      const root = fieldsRef.current
      if (!root) return
      const target = label
        ? root.querySelector<HTMLElement>(`[aria-label="${label}"]:not([disabled])`)
        : root.querySelector<HTMLElement>(
            'input:not([disabled]), textarea:not([disabled]), [role="combobox"]:not([disabled])',
          )
      target?.focus()
    })
  }, [])

  return { keepOpen, setKeepOpen, fieldsRef, focusFirstField }
}

export function KeepOpenToggle({
  checked,
  onCheckedChange,
  label = 'Seguir agregando',
}: {
  checked: boolean
  onCheckedChange: (next: boolean) => void
  label?: string
}) {
  return (
    <label className="flex items-center gap-2 type-body-2 fg-subtle sm:mr-auto">
      <Checkbox checked={checked} onCheckedChange={(next) => onCheckedChange(next === true)} />
      {label}
    </label>
  )
}

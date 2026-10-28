import { useCallback, useRef, useState } from 'react'

import { Checkbox } from '@/app/components/components'

/**
 * "Seguir agregando" — the footer toggle that keeps a create dialog open after a
 * confirmed write, so the operator can register several items in a row without
 * reopening it. Loading a month of commitments or a batch of cobros is the normal
 * shape of this work, and closing the dialog after each one turns one task into N.
 *
 * It changes ONLY the closing behaviour. The write still has to land before the
 * success toast fires — a dialog that stays open is
 * not permission to confirm early, and on failure the form stays open with the
 * user's input either way.
 *
 * Deliberately NOT persisted between openings: it is a per-session intent ("I am
 * about to load several"), and a checkbox that silently remembers itself is how a
 * dialog stops closing for someone who has forgotten they ever ticked it.
 */
export function useKeepOpen() {
  const [keepOpen, setKeepOpen] = useState(false)
  const fieldsRef = useRef<HTMLDivElement>(null)

  /**
   * Put the caret back on a field after a keep-open reset. Not a nicety: the submit
   * button the user just activated becomes DISABLED the moment the form resets (it is
   * empty again), and a disabled element cannot hold focus — so focus falls to `<body>`
   * and a keyboard user is ejected from a dialog that is still open, with no way back in
   * except the mouse.
   *
   * It resolves the target by querying INSIDE `fieldsRef` rather than holding a ref on
   * the field itself, because this app is on React 18: a `ref` passed to a function
   * component that does not `forwardRef` is dropped by React and never reaches the DOM
   * node. `Input` does not forward — so the obvious `ref={firstFieldRef}` version of this
   * type-checked, rendered, and silently did nothing. The types accept `ref` on those
   * components, so only running it catches this.
   *
   * `label` targets a specific control by its `aria-label`; without it, the first enabled
   * field wins. Deferred a frame so it runs after the reset has committed.
   */
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

/**
 * Renders as the FIRST child of `DialogFooter`, which is `sm:justify-end` — the
 * `sm:mr-auto` is what pushes it to the far left while the buttons stay right. On
 * mobile the footer is `flex-col-reverse`, so it lands below the buttons, which is
 * the right order there: confirm first, options after.
 */
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

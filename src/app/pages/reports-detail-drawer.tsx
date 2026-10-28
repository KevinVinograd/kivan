import { useRef, type ReactNode } from 'react'

import { Sheet, SheetContent, SheetTitle } from '@/app/components/components'

/**
 * The Reportes drill-in drawer. Every report detail (Productividad, Rentabilidad,
 * Carga de equipo) opens here, so the page behind it — the tab strip, the KPIs, the
 * charts and the table the record is being read against — survives the drill-in
 * instead of being replaced by a 360px rail. Reportes is an analytics surface: the
 * surrounding aggregate IS the context, which is why the detail is an overlay here and
 * a real panel on the operational entity workspaces (see
 * the convention).
 *
 * It states its intent — a right drawer — and `SheetContent` owns how that renders per
 * width: the floating right panel from 1024px (half the viewport, a third from 1440px),
 * a bottom sheet below. No `side` branch and no width override here; both are the
 * primitive's. Read-only, so the primitive's X is off:
 * the detail ships its own "Cerrar detalle" control.
 */
export function ReportsDetailDrawer({
  title,
  detail,
  onClose,
}: {
  /** Accessible name for the dialog (sr-only) — the visible title lives in the detail. */
  title: string
  /** The detail body; `null` closes the drawer. */
  detail: ReactNode
  onClose: () => void
}) {
  const open = detail != null
  // The selection clears on the same tick as the close, so `detail` is already null
  // while the Sheet plays its exit animation. Hold the last rendered detail (and its
  // accessible name) so the panel slides out with its content instead of blanking.
  const held = useRef<{ title: string; detail: ReactNode }>({ title, detail })
  if (open) held.current = { title, detail }

  // This is a CONTROLLED Sheet with no SheetTrigger: a row opens it by writing `?open=`.
  // Radix's modal `onCloseAutoFocus` cancels FocusScope's restore and then focuses its own
  // `triggerRef`, which is always null here, so focus would land on `<body>` on every close
  // and a keyboard user would be dropped back to the top of the page. Remember what held
  // focus when the drawer opened and restore it ourselves.
  const returnFocus = useRef<HTMLElement | null>(null)
  const wasOpen = useRef(false)
  if (open && !wasOpen.current) returnFocus.current = document.activeElement as HTMLElement | null
  wasOpen.current = open

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <SheetContent
        side="right"
        showCloseButton={false}
        aria-describedby={undefined}
        onCloseAutoFocus={(event) => {
          const target = returnFocus.current
          if (!target?.isConnected) return // let Radix handle it; the trigger is gone
          event.preventDefault()
          target.focus()
        }}
      >
        <SheetTitle className="sr-only">{open ? title : held.current.title}</SheetTitle>
        {/* Rendered as a direct SheetContent child (which is `flex flex-col gap-4`) so the
            detail's pinned header and flex-1 scroll region size against the panel. */}
        {open ? detail : held.current.detail}
      </SheetContent>
    </Sheet>
  )
}

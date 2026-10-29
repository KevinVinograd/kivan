import { useRef, type ReactNode } from 'react'

import { Sheet, SheetContent, SheetTitle } from '@/app/components/components'

export function ReportsDetailDrawer({
  title,
  detail,
  onClose,
}: {
  title: string
  detail: ReactNode
  onClose: () => void
}) {
  const open = detail != null
  const held = useRef<{ title: string; detail: ReactNode }>({ title, detail })
  if (open) held.current = { title, detail }

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
          if (!target?.isConnected) return
          event.preventDefault()
          target.focus()
        }}
      >
        <SheetTitle className="sr-only">{open ? title : held.current.title}</SheetTitle>
        {open ? detail : held.current.detail}
      </SheetContent>
    </Sheet>
  )
}

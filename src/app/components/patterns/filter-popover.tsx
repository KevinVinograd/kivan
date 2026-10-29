import type { ReactNode } from 'react'

import { AFFORDANCE } from '@/app/lib/icon-registry'
import {
  Button,
  IconButton,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/app/components/components'

const FilterIcon = AFFORDANCE.filter

export type FilterPopoverProps = {
  count?: number
  title?: string
  triggerLabel?: string
  onClear?: () => void
  canClear?: boolean
  clearLabel?: string
  children: ReactNode
}

export function FilterPopover({
  count = 0,
  title = 'Filtros',
  triggerLabel,
  onClear,
  canClear,
  clearLabel = 'Limpiar',
  children,
}: FilterPopoverProps) {
  const active = count > 0
  const showClear = onClear != null && (canClear ?? active)
  return (
    <Popover>
      <span className="relative inline-flex pt-1">
        <PopoverTrigger asChild>
          <IconButton
            aria-label={triggerLabel ?? title}
            variant="outlined"
            color="primary"
            size="default"
            selected={active}
          >
            <FilterIcon className="size-5" aria-hidden />
          </IconButton>
        </PopoverTrigger>
        {active ? (
          <span className="pointer-events-none absolute top-0 -right-1 inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-primary-default type-caption tabular-nums fg-reverse">
            {count}
          </span>
        ) : null}
      </span>
      <PopoverContent align="end" className="flex w-72 flex-col gap-2">
        <div className="flex items-center justify-between px-2 pt-2">
          <span className="type-body-2 font-semibold fg-subtle">{title}</span>
          {showClear ? (
            <Button variant="transparent" color="primary" size="dense" onClick={onClear}>
              {clearLabel}
            </Button>
          ) : null}
        </div>
        {children}
      </PopoverContent>
    </Popover>
  )
}

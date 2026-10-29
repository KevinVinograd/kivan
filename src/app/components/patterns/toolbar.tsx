import { type ReactNode } from 'react'

import { Input } from '@/app/components/components'

export type ToolbarSearch = {
  value: string
  onChange: (value: string) => void
  placeholder: string
  label?: string
}

export type ToolbarProps = {
  search?: ToolbarSearch
  filters?: ReactNode
  trailing?: ReactNode
  bulk?: ReactNode
}

export function Toolbar({ search, filters, trailing, bulk }: ToolbarProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        {search ? (
          <Input
            value={search.value}
            onChange={(event) => search.onChange(event.target.value)}
            placeholder={search.placeholder}
            aria-label={search.label ?? search.placeholder}
            className="min-w-0 flex-1 sm:max-w-72"
          />
        ) : null}
        {filters}
        {trailing ? <div className="ml-auto flex shrink-0 items-center gap-2">{trailing}</div> : null}
      </div>
      {bulk}
    </div>
  )
}

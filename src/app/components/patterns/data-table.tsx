import * as React from "react"
import {
  type Cell,
  type ColumnDef,
  type ColumnFiltersState,
  type FilterFn,
  type OnChangeFn,
  type Row,
  type RowData,
  type RowSelectionState,
  type SortingFn,
  type SortingState,
  type Table as TanstackTable,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import {
  ArrowsDownUp as ArrowUpDownIcon,
  CaretDown as ChevronDownIcon,
  CaretUp as ChevronUpIcon,
} from "@phosphor-icons/react"

import { cn } from "@/app/lib/utils"
import { motionClass } from "@/app/lib/motion"
import {
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/app/components/components"
import { useIsMobile } from "@/app/lib/use-is-mobile"

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData extends RowData, TValue> {
    mobile?: "title" | "secondary" | "badge" | "hidden"
    hideOnNarrow?: boolean
  }
}

export type DataTableProps<TData, TValue> = {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  toolbar?: (table: TanstackTable<TData>) => React.ReactNode
  onRowClick?: (row: TData) => void
  globalFilterFn?: FilterFn<TData>
  emptyState?: (table: TanstackTable<TData>) => React.ReactNode
  pageSize?: number
  initialColumnVisibility?: VisibilityState
  rowSelection?: RowSelectionState
  onRowSelectionChange?: OnChangeFn<RowSelectionState>
  columnFilters?: ColumnFiltersState
  onColumnFiltersChange?: OnChangeFn<ColumnFiltersState>
  getRowId?: (originalRow: TData, index: number) => string
  pinActionsColumn?: boolean
}

const PINNED_ACTIONS_CLASS = "sticky right-0 z-10 bg-pin-surface pinned-actions-fade"

function ariaSort(
  sorted: false | "asc" | "desc",
): "ascending" | "descending" | "none" {
  if (sorted === "asc") return "ascending"
  if (sorted === "desc") return "descending"
  return "none"
}

function SortIcon({ sorted }: { sorted: false | "asc" | "desc" }) {
  if (sorted === "asc") return <ChevronUpIcon className="size-3.5" />
  if (sorted === "desc") return <ChevronDownIcon className="size-3.5" />
  return <ArrowUpDownIcon className="size-3.5 fg-subtle" />
}

type MobileCardParts<TData> = {
  title: Cell<TData, unknown> | undefined
  secondary: Cell<TData, unknown>[]
  badge: Cell<TData, unknown> | undefined
  actions: Cell<TData, unknown> | undefined
}

function classifyMobileCells<TData>(
  cells: Cell<TData, unknown>[],
  anyMobileMeta: boolean,
): MobileCardParts<TData> {
  let title: Cell<TData, unknown> | undefined
  let badge: Cell<TData, unknown> | undefined
  let actions: Cell<TData, unknown> | undefined
  const secondary: Cell<TData, unknown>[] = []
  const untagged: Cell<TData, unknown>[] = []

  for (const cell of cells) {
    const id = cell.column.id
    if (id === "actions" || id === "action") {
      actions = cell
      continue
    }
    if (id === "select") continue
    const role = cell.column.columnDef.meta?.mobile
    if (role === "hidden") continue
    if (role === "title") {
      title ??= cell
      continue
    }
    if (role === "badge") {
      badge ??= cell
      continue
    }
    if (role === "secondary") {
      secondary.push(cell)
      continue
    }
    untagged.push(cell)
  }

  if (!title) title = untagged.shift()
  if (!anyMobileMeta && secondary.length === 0) {
    secondary.push(...untagged.slice(0, 2))
  }
  return { title, secondary, badge, actions }
}

function DataTableMobileRow<TData>({
  row,
  anyMobileMeta,
  onRowClick,
}: {
  row: Row<TData>
  anyMobileMeta: boolean
  onRowClick?: (row: TData) => void
}) {
  const { title, secondary, badge, actions } = classifyMobileCells(
    row.getVisibleCells(),
    anyMobileMeta,
  )
  const clickable = Boolean(onRowClick)
  const activate = () => onRowClick?.(row.original)

  return (
    <li className="border-b border-alpha-subtle last:border-b-0">
      <div
        role={clickable ? "button" : undefined}
        tabIndex={clickable ? 0 : undefined}
        onClick={clickable ? activate : undefined}
        onKeyDown={
          clickable
            ? (event) => {
                if (event.target !== event.currentTarget) return
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault()
                  activate()
                }
              }
            : undefined
        }
        className={cn(
          "flex items-start justify-between gap-3 rounded-control px-2 py-3",
          clickable && motionClass("standard"),
          clickable &&
            "cursor-pointer hover:bg-alpha-subtle-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
        )}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {title ? (
            <div className="min-w-0 type-body-2 font-medium fg-default">
              {flexRender(title.column.columnDef.cell, title.getContext())}
            </div>
          ) : null}
          {secondary.length > 0 || badge ? (
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 type-caption fg-subtle">
              {secondary.map((cell, index) => (
                <React.Fragment key={cell.id}>
                  {index > 0 ? (
                    <span aria-hidden className="fg-subtle">
                      ·
                    </span>
                  ) : null}
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </span>
                </React.Fragment>
              ))}
              {badge ? (
                <span className="ms-auto inline-flex items-center">
                  {flexRender(badge.column.columnDef.cell, badge.getContext())}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        {actions ? (
          <div
            className="-mr-1 shrink-0"
            onClick={(event) => event.stopPropagation()}
          >
            {flexRender(actions.column.columnDef.cell, actions.getContext())}
          </div>
        ) : null}
      </div>
    </li>
  )
}

const SPANISH = new Intl.Collator("es", { sensitivity: "base", numeric: true })

const spanishSort: SortingFn<RowData> = (rowA, rowB, columnId) => {
  const a = rowA.getValue(columnId)
  const b = rowB.getValue(columnId)
  if (typeof a === "string" && typeof b === "string") return SPANISH.compare(a, b)
  if (a == null || b == null) return a == null ? (b == null ? 0 : 1) : -1
  return a < b ? -1 : a > b ? 1 : 0
}

export function DataTable<TData, TValue>({
  columns,
  data,
  toolbar,
  onRowClick,
  globalFilterFn,
  emptyState,
  pageSize = 10,
  initialColumnVisibility = {},
  rowSelection,
  onRowSelectionChange,
  columnFilters,
  onColumnFiltersChange,
  getRowId,
  pinActionsColumn = false,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([])
  const [internalColumnFilters, setInternalColumnFilters] = React.useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = React.useState<VisibilityState>(
    initialColumnVisibility,
  )
  const [internalRowSelection, setInternalRowSelection] = React.useState<RowSelectionState>({})
  const [globalFilter, setGlobalFilter] = React.useState("")

  const rowSelectionState = rowSelection ?? internalRowSelection
  const handleRowSelectionChange = onRowSelectionChange ?? setInternalRowSelection
  const columnFiltersState = columnFilters ?? internalColumnFilters
  const handleColumnFiltersChange = onColumnFiltersChange ?? setInternalColumnFilters

  const table = useReactTable({
    data,
    columns,
    defaultColumn: { sortingFn: spanishSort as SortingFn<TData> },
    state: { sorting, columnFilters: columnFiltersState, columnVisibility, rowSelection: rowSelectionState, globalFilter },
    enableRowSelection: true,
    getRowId,
    onSortingChange: setSorting,
    onColumnFiltersChange: handleColumnFiltersChange,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: handleRowSelectionChange,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  })

  const rows = table.getRowModel().rows
  const visibleColumnCount = table.getVisibleLeafColumns().length
  const filteredCount = table.getFilteredRowModel().rows.length
  const selectedCount = table.getFilteredSelectedRowModel().rows.length

  const isMobile = useIsMobile()
  const anyMobileMeta = table
    .getAllLeafColumns()
    .some((column) => column.columnDef.meta?.mobile != null)

  const rootRef = React.useRef<HTMLDivElement>(null)
  const [actionsPinned, setActionsPinned] = React.useState(false)
  React.useEffect(() => {
    if (!pinActionsColumn) {
      setActionsPinned(false)
      return
    }
    const scroller = rootRef.current?.querySelector<HTMLElement>('[data-slot="table-container"]')
    if (!scroller) return
    const measure = () => setActionsPinned(scroller.scrollWidth - scroller.clientWidth > 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(scroller)
    const tableEl = scroller.querySelector<HTMLElement>('[data-slot="table"]')
    if (tableEl) observer.observe(tableEl)
    return () => observer.disconnect()
  }, [pinActionsColumn])

  const pinnedClass = (columnId: string) =>
    actionsPinned && columnId === "actions" ? PINNED_ACTIONS_CLASS : undefined

  const visibleLeafColumns = table.getVisibleLeafColumns()
  const trailingColumnId = visibleLeafColumns[visibleLeafColumns.length - 1]?.id
  const trailingColumnIsControl =
    trailingColumnId === "actions" || trailingColumnId === "action"

  return (
    <div ref={rootRef} className="@container/datatable flex flex-col gap-4">
      {toolbar?.(table)}

      {isMobile ? (
        rows.length > 0 ? (
          <ul className="flex flex-col">
            {rows.map((row) => (
              <DataTableMobileRow
                key={row.id}
                row={row}
                anyMobileMeta={anyMobileMeta}
                onRowClick={onRowClick}
              />
            ))}
          </ul>
        ) : (
          <div className="flex min-h-24 items-center justify-center px-2 py-6 text-center fg-subtle">
            {emptyState ? emptyState(table) : "Sin resultados"}
          </div>
        )
      ) : (
      <Table maskTrailingEdge={!trailingColumnIsControl}>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const sorted = header.column.getIsSorted()
                return (
                  <TableHead
                    key={header.id}
                    aria-sort={ariaSort(sorted)}
                    className={cn(
                      pinnedClass(header.column.id),
                      header.column.columnDef.meta?.hideOnNarrow && "@max-6xl/datatable:hidden",
                    )}
                  >
                    {header.isPlaceholder ? null : header.column.getCanSort() ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className={cn(
                          "-mx-1 inline-flex items-center gap-1 rounded-control px-1 py-0.5 font-medium select-none hover:bg-alpha-subtle-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
                          motionClass("standard"),
                        )}
                      >
                        {flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )}
                        <SortIcon sorted={sorted} />
                      </button>
                    ) : (
                      flexRender(
                        header.column.columnDef.header,
                        header.getContext(),
                      )
                    )}
                  </TableHead>
                )
              })}
            </TableRow>
          ))}
        </TableHeader>

        <TableBody>
          {rows.length > 0 ? (
            rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() ? "selected" : undefined}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                className={cn("group/row", onRowClick && "cursor-pointer")}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={cn(
                      pinnedClass(cell.column.id),
                      cell.column.columnDef.meta?.hideOnNarrow && "@max-6xl/datatable:hidden",
                    )}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={visibleColumnCount}
                className="h-24 text-center align-middle fg-subtle"
              >
                {emptyState ? emptyState(table) : "Sin resultados"}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 px-1">
        <span className="type-caption fg-subtle">
          {selectedCount > 0
            ? `${selectedCount} de ${filteredCount} seleccionados`
            : `${filteredCount} resultados`}
        </span>
        <div className="flex items-center gap-2">
          <span className="type-caption fg-subtle">
            Página {table.getState().pagination.pageIndex + 1} de{" "}
            {Math.max(table.getPageCount(), 1)}
          </span>
          <Button
            variant="outlined"
            color="primary"
            size="dense"
            disabled={!table.getCanPreviousPage()}
            onClick={() => table.previousPage()}
          >
            Anterior
          </Button>
          <Button
            variant="outlined"
            color="primary"
            size="dense"
            disabled={!table.getCanNextPage()}
            onClick={() => table.nextPage()}
          >
            Siguiente
          </Button>
        </div>
      </div>
    </div>
  )
}

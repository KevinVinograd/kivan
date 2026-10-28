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

/**
 * Mobile card-list metadata, consumed by DataTable's phone layout (`<768px`).
 * Tag columns so the compact two-line card knows which cell is the title, which
 * are the secondary figures and which is the status badge — and which columns to
 * drop on phones. Untagged tables fall back to a heuristic (first column = title,
 * next two = secondary). The structural `id: "select"` and `id: "actions"`
 * columns are handled by the card layout and need no tag.
 */
declare module "@tanstack/react-table" {
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Role of this column inside the mobile card. */
    mobile?: "title" | "secondary" | "badge" | "hidden"
    /**
     * Low-priority column: hidden while the table's own container is narrow
     * (< 1152px, the `@max-6xl/datatable` container-query breakpoint) so the
     * primary columns are never clipped at tablet width or on a desktop content
     * column narrowed by the nav rail, and shown again on a wide container. Keyed
     * off the table's available width (a container query), not the viewport, so a
     * 1280px window whose content column is ~960px still collapses these.
     */
    hideOnNarrow?: boolean
  }
}

/**
 * DataTable — the product's generic, domain-neutral data grid pattern. It pairs
 * the governed `Table` primitive with `@tanstack/react-table` headless state
 * (sorting, column filters, global filter, column visibility, row selection and
 * client-side pagination) and exposes the table instance to an optional toolbar
 * render slot so consumers can drive search/filters/visibility/bulk actions
 * without the pattern knowing any domain. Token-pure: it composes `Table` and
 * `Button`; it never hand-rolls a `<table>` or raw chrome.
 *
 * Repo's first governed pattern (`patterns/` namespace). Domain-specific column
 * definitions, toolbars and empty states live in feature code and are passed in.
 */
export type DataTableProps<TData, TValue> = {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  /** Optional toolbar above the table; receives the live table instance. */
  toolbar?: (table: TanstackTable<TData>) => React.ReactNode
  /** Row body click (interactive cells stop propagation themselves). */
  onRowClick?: (row: TData) => void
  /** Custom global-filter matcher (consumer owns which fields are searchable). */
  globalFilterFn?: FilterFn<TData>
  /** Rendered in place of rows when the filtered set is empty; receives the table. */
  emptyState?: (table: TanstackTable<TData>) => React.ReactNode
  /** Initial page size (client-side pagination). */
  pageSize?: number
  /** Initial column visibility — keys are column ids, `false` hides by default.
   *  Consumers stay able to toggle them via the toolbar's visibility menu. */
  initialColumnVisibility?: VisibilityState
  /** Controlled row selection. When provided (with `onRowSelectionChange`), the
   *  consumer owns selection so it can be shared across views; otherwise the
   *  pattern keeps it internally. */
  rowSelection?: RowSelectionState
  /** Change handler for controlled row selection. */
  onRowSelectionChange?: OnChangeFn<RowSelectionState>
  /** Controlled column filters. When provided (with `onColumnFiltersChange`), the
   *  consumer owns the filter state so it can be shared across views (e.g. a
   *  master-detail list panel that filters the same records); otherwise the
   *  pattern keeps it internally. */
  columnFilters?: ColumnFiltersState
  /** Change handler for controlled column filters. */
  onColumnFiltersChange?: OnChangeFn<ColumnFiltersState>
  /** Stable row id (e.g. the record id) so selection keys survive reordering and
   *  match an external selection source. Defaults to the row index. */
  getRowId?: (originalRow: TData, index: number) => string
  /** Pin the actions column (the `id: "actions"` column) to the right while the
   *  grid overflows horizontally, so its row controls stay visible during sideways
   *  scroll. No effect when the table fits its container. Opt-in (default off). */
  pinActionsColumn?: boolean
}

/**
 * Right-pinned, horizontally-sticky styling for the actions column (the shared
 * `id: "actions"` convention), applied ONLY while the grid actually overflows
 * horizontally (gated by `pinActionsColumn` + an overflow measurement) so the row
 * controls stay reachable as a wide table scrolls sideways. The cell must be OPAQUE
 * to hide the cells scrolling underneath, and `bg-pin-surface` resolves that fill
 * from `--pin-surface`: the page by default, or the host container's own fill when
 * one declares it (Card's opaque variants set `pin-surface-flat`). Hardcoding
 * `bg-page` here was correct only while every table sat directly on the page — the
 * moment one lives inside a Card it paints a page-colored strip through the card and
 * fades into the wrong color. The cell keeps its normal 8px (`p-2`) padding and no
 * border; when the table fits its container the class is not applied, so the column
 * stays a normal transparent cell that takes the row hover/selected tint.
 *
 * `pinned-actions-fade` adds a soft gradient band on the cell's LEADING (left)
 * edge — a `::before` painted by the semantic gradient utility — so the data
 * columns scrolling under the pinned column fade out instead of hard-cutting
 * against the opaque body. While pinned, this band IS the grid's trailing-edge cue:
 * the pin and `Table`'s trailing mask are mutually exclusive (see `maskTrailingEdge`
 * below), because a container mask fades sticky cells too and would wash out the very
 * `⋯` trigger the pin exists to keep reachable. The band fades to the same
 * `--pin-surface` the cell carries — one variable, so the two can never drift apart —
 * keeps the trigger fully opaque, and disappears with the pin when the table fits.
 * See `semantics-gradients.css` and `semantics-surface.css`.
 */
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

/**
 * Classify a row's visible cells into the compact two-line mobile card slots.
 * When any column carries `meta.mobile`, tags are authoritative (untagged
 * non-structural columns are dropped to keep the card compact). With no tags at
 * all, a heuristic applies: the first non-structural cell is the title and the
 * next two are secondary figures. The `select` column is always dropped and the
 * `actions` column is always the trailing control.
 */
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

/**
 * One row rendered as a compact two-line card for the phone layout: title (+
 * trailing actions) on the first line, secondary figures and the status badge on
 * the second. Cells are rendered through their existing column `cell` renderers,
 * so domain formatting (links, currency, badges) is preserved — only the
 * arrangement changes.
 */
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
                // Only keys aimed at the row itself activate it. The actions menu inside is a
                // real <button>: Radix opens it on keydown and calls preventDefault but NOT
                // stopPropagation, so an Enter meant for the menu would otherwise bubble here
                // and open the row too. The onClick guard below cannot cover this — it stops
                // `click`, and a keyboard activation of the trigger never fires one.
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

/**
 * Text in Spanish order (case and accents ignored, "Item 2" before "Item 10"); everything else
 * by value. TanStack's "auto" sort samples rows `slice(10)` (rows 11 onwards, a library bug),
 * so on a table of 10 rows or fewer it fell back to a raw `<` comparison: capitals before
 * lowercase and accented initials after "z" ("Responsable Paid Media" before
 * "Responsable de Comunicación"). Found on the 25/10 review.
 */
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

  // Controlled selection / filters when the consumer supplies them (shared across
  // views), else the pattern owns them internally.
  const rowSelectionState = rowSelection ?? internalRowSelection
  const handleRowSelectionChange = onRowSelectionChange ?? setInternalRowSelection
  const columnFiltersState = columnFilters ?? internalColumnFilters
  const handleColumnFiltersChange = onColumnFiltersChange ?? setInternalColumnFilters

  const table = useReactTable({
    data,
    columns,
    // Every column sorts through `spanishSort` unless it names its own `sortingFn`.
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

  // Phones (<768px) render rows as a compact two-line card-list instead of the
  // horizontally-scrolling grid; tablet/desktop keep the table. Column `meta.mobile`
  // tags drive the card slots (title / secondary / badge), with a heuristic fallback.
  const isMobile = useIsMobile()
  const anyMobileMeta = table
    .getAllLeafColumns()
    .some((column) => column.columnDef.meta?.mobile != null)

  // Pin the actions column only while the grid actually overflows horizontally.
  // We observe the `Table` primitive's scroll container (and inner table) so the
  // pin toggles on viewport resize, column-visibility changes, and data changes.
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

  // A mask fades whatever sits under it — sticky cell or plain cell alike — while
  // leaving it clickable, so the trailing fade must never land on a CONTROL. The
  // condition is "does the last column hold one", NOT "is it pinned": an unpinned
  // grid whose trailing column is the shared `actions`/`action` control (e.g. the
  // monthly alerts grid) would otherwise fade its own trigger below contrast. Both
  // ids are matched because the convention is spelled both ways across the pages.
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

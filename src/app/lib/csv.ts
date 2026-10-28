/**
 * Generic, domain-neutral CSV helpers shared by the module export files
 * (`clients-export.ts`, `team-export.ts`): RFC-4180 quoting, a UTF-8 BOM so
 * spreadsheets read accents right, CRLF rows, and a browser-download trigger.
 * No backend. Each module keeps its own domain column schema and builds the
 * header + rows; this module only does the generic cell-quoting and download.
 */

import { todayIso } from './iso-date'

/** RFC-4180-style cell: wrap in quotes and double any embedded quote, so commas,
 *  quotes and newlines inside a value never break the row. */
export function csvCell(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`
}

/** Build a BOM-led CSV from a header line + row lines and trigger a browser
 *  download under the given filename. */
export function downloadCsv(header: string, rows: string[], filename: string): void {
  // Lead with a BOM so spreadsheets read the UTF-8 accents right.
  const csv = String.fromCharCode(0xfeff) + [header, ...rows].join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

/**
 * Today's date as `YYYY-MM-DD`, for dated export filenames.
 *
 * Reads the LOCAL calendar. It used to go through `toISOString()`, so after 21:00 in UTC-3 the
 * user exported a file stamped with tomorrow's date.
 */
export function today(): string {
  return todayIso()
}

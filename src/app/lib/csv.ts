import { todayIso } from './iso-date'

export function csvCell(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`
}

export function downloadCsv(header: string, rows: string[], filename: string): void {
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

export function today(): string {
  return todayIso()
}

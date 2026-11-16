/** CSV export that opens cleanly in Excel, Numbers and Google Sheets. */
export type CsvValue = string | number | null | undefined

function cell(value: CsvValue): string {
  if (value === null || value === undefined) return ''
  let text = String(value)
  // A cell starting with = + - @ runs as a formula in spreadsheets. Customer
  // names and notes are typed by strangers, so neutralise them. Phone numbers
  // (+971...) are kept readable the same way.
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv(headers: string[], rows: CsvValue[][]): string {
  return [headers, ...rows].map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n'
}

export function downloadCsv(filename: string, csv: string) {
  // The BOM makes Excel read UTF-8 (Arabic and accented names) correctly.
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

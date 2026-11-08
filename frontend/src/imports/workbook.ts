import * as XLSX from 'xlsx'

export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024
export const MAX_IMPORT_ROWS = 5000
const MAX_SHEET_DIMENSION_ROWS = 6000
const MAX_SHEET_DIMENSION_COLUMNS = 200

export type WorkbookPreview = { name: string; rows: string[][] }

function cellText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  return String(value)
}

export function openImportWorkbook(buffer: ArrayBuffer): XLSX.WorkBook {
  return XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: false, dense: true })
}

export function readImportSheet(workbook: XLSX.WorkBook, sheetName: string): string[][] {
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) throw new Error('Choose a worksheet in this file.')
  const reference = sheet['!ref']
  if (reference) {
    const range = XLSX.utils.decode_range(reference)
    const rowCount = range.e.r - range.s.r + 1
    const columnCount = range.e.c - range.s.c + 1
    if (rowCount > MAX_SHEET_DIMENSION_ROWS) throw new Error('This worksheet has too many rows. Keep it under 6,000 rows and try again.')
    if (columnCount > MAX_SHEET_DIMENSION_COLUMNS) throw new Error('This worksheet has too many columns. Keep it under 200 columns and try again.')
  }
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: '', blankrows: true })
  return rows.map((row) => row.map(cellText))
}

export function summarizeImportWorkbook(workbook: XLSX.WorkBook): WorkbookPreview[] {
  return workbook.SheetNames.map((name) => ({ name, rows: readImportSheet(workbook, name).slice(0, 5) }))
}

export function isSupportedImportFile(name: string): boolean {
  return /\.(xlsx|xls|csv)$/i.test(name)
}

export function countDataRows(rows: string[][], headerIndex: number): number {
  return rows.slice(headerIndex + 1).filter((row) => row.some((cell) => cell.trim() !== '')).length
}

export function suggestHeaderRow(rows: string[][]): number {
  const candidates = rows.slice(0, 5)
  let bestIndex = 0
  let bestCount = 0
  candidates.forEach((row, index) => {
    const count = row.filter((cell) => cell.trim() !== '').length
    if (count > bestCount) {
      bestIndex = index
      bestCount = count
    }
  })
  return bestIndex
}


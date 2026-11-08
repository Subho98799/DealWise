/// <reference lib="webworker" />
import { openImportWorkbook, readImportSheet, summarizeImportWorkbook } from './workbook'

type Request = { type: 'open'; buffer: ArrayBuffer } | { type: 'sheet'; name: string }
let workbook: ReturnType<typeof openImportWorkbook> | null = null

self.onmessage = (event: MessageEvent<Request>) => {
  try {
    if (event.data.type === 'open') {
      workbook = openImportWorkbook(event.data.buffer)
      self.postMessage({ type: 'opened', sheets: summarizeImportWorkbook(workbook) })
      return
    }
    if (!workbook) throw new Error('Choose a file again before selecting a worksheet.')
    self.postMessage({ type: 'sheet', name: event.data.name, rows: readImportSheet(workbook, event.data.name) })
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'This file could not be read.' })
  }
}


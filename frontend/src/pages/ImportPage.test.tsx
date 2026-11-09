import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { openImportWorkbook, readImportSheet, summarizeImportWorkbook } from '../imports/workbook'
import { UserContext } from '../data/hooks'
import ImportPage from './ImportPage'

const { apiMock } = vi.hoisted(() => ({ apiMock: vi.fn() }))
vi.mock('../lib/api', () => ({ api: apiMock, apiBlob: vi.fn(), ApiError: class ApiError extends Error {} }))

const user = { id: 'fake-user', name: 'Fixture User', email: 'fake@example.test', avatar_url: null, role: 'user' as const, alert_days: 3, timezone: 'Asia/Kolkata' }
const job = {
  id: 'job-1', import_id: '4b1cc9c7-4790-4d61-8df0-4870ec1fbfa0', filename: 'messy-deals.xlsx', status: 'committed' as const,
  rows_total: 3, rows_imported: 2, rows_skipped_duplicate: 1, rows_failed: 0, mediators_created: 2,
  total_paid: '131199.50', total_refund: '2598.00', errors: [], created_at: '2026-11-08T10:00:00Z', undone_at: null,
}

type ParserRequest = { type: 'open'; buffer: ArrayBuffer } | { type: 'sheet'; name: string }
class FixtureWorker {
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  private workbook: ReturnType<typeof openImportWorkbook> | null = null
  postMessage(request: ParserRequest) {
    window.setTimeout(() => {
      try {
        if (request.type === 'open') {
          this.workbook = openImportWorkbook(request.buffer)
          this.onmessage?.(new MessageEvent('message', { data: { type: 'opened', sheets: summarizeImportWorkbook(this.workbook) } }))
        } else if (this.workbook) {
          this.onmessage?.(new MessageEvent('message', { data: { type: 'sheet', name: request.name, rows: readImportSheet(this.workbook, request.name) } }))
        }
      } catch {
        this.onerror?.()
      }
    }, 0)
  }
  terminate() {}
}

async function fixtureBytes() {
  const bytes = await readFile(resolve(process.cwd(), 'src', 'imports', 'fixtures', 'messy-deals.xlsx'))
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

function previewFor(body: { rows: Record<string, string>[]; options: { duplicate_policy: string; value_maps: Record<string, Record<string, string>> } }) {
  const duplicateImport = body.options.duplicate_policy === 'import'
  return {
    rows: body.rows.map((row, index) => ({
      row_number: index + 1,
      status: index === 1 ? 'duplicate' : 'ok',
      will_import: index !== 1 || duplicateImport,
      duplicate_of: index === 1 ? 1 : null,
      duplicate_reason: index === 1 ? 'Matches row 1 in this file' : null,
      values: {
        product: row.product, date_taken: '2025-11-08', amount_paid: index === 2 ? '129900.00' : '1299.50',
        less_amount: index === 2 ? '0.00' : '100.00', commission: index === 2 ? '0.00' : '200.00',
        refund_amount: index === 2 ? '129900.00' : '1399.50', review_status: index === 2 ? (body.options.value_maps.review_status?.mystery ?? 'pending') : 'pending',
      },
      errors: [], warnings: index === 2 ? [{ field: 'refund_amount', reason: 'Mapped Less is used.' }] : [],
    })),
    counts: { total: 3, will_import: duplicateImport ? 3 : 2, duplicates: 1, errors: 0 },
    unrecognized_status_values: body.options.value_maps.review_status?.mystery ? {} : { review_status: ['mystery'] },
    mediators_to_create: ['Priya Deals', 'New Agent'],
    existing_mediators: [],
    reconciliation: { total_paid: duplicateImport ? '132499.00' : '131199.50', total_refund: duplicateImport ? '132699.00' : '131299.50', total_gain_loss: duplicateImport ? '200.00' : '100.00', pending_refund: duplicateImport ? '132699.00' : '131299.50' },
  }
}

describe('import wizard', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.stubGlobal('Worker', FixtureWorker)
    apiMock.mockReset()
    apiMock.mockImplementation(async (path: string, init?: { method?: string; json?: unknown }) => {
      if (path === '/api/import/jobs') return []
      if (path === '/api/import/preview') return previewFor(init?.json as Parameters<typeof previewFor>[0])
      if (path === '/api/import/commit') return job
      throw new Error(`Unexpected import API call: ${path}`)
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('parses a generated messy fixture, maps, previews, handles offline state and imports', async () => {
    const buffer = await fixtureBytes()
    const file = new File([buffer], 'messy-deals.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    Object.defineProperty(file, 'arrayBuffer', { value: async () => buffer })
    render(<MemoryRouter><UserContext.Provider value={user}><ImportPage /></UserContext.Provider></MemoryRouter>)

    fireEvent.change(screen.getByTestId('import-file-input'), { target: { files: [file] } })
    await screen.findByTestId('import-header-row-2')
    expect(screen.getByTestId('import-row-count').textContent).toContain('3')
    fireEvent.click(screen.getByTestId('import-header-row-2'))
    fireEvent.click(screen.getByTestId('import-continue-map'))

    expect((screen.getByTestId('import-map-product') as HTMLSelectElement).value).toBe('0')
    expect((screen.getByTestId('import-map-amount_paid') as HTMLSelectElement).value).toBe('5')
    expect((screen.getByTestId('import-map-less_amount') as HTMLSelectElement).value).toBe('6')
    expect((screen.getByTestId('import-map-date_taken') as HTMLSelectElement).value).toBe('4')
    fireEvent.click(screen.getByTestId('import-continue-fix'))
    await screen.findAllByTestId('import-date-sample')
    await screen.findByLabelText('Map review_status value mystery')
    fireEvent.change(screen.getByLabelText('Map review_status value mystery'), { target: { value: 'done' } })
    await waitFor(() => expect(screen.getByTestId('import-continue-review').hasAttribute('disabled')).toBe(false))
    fireEvent.click(screen.getByTestId('import-continue-review'))
    await screen.findByTestId('import-review-step')
    expect(screen.getByTestId('import-tab-duplicate').textContent).toContain('1')
    expect(screen.getByText('₹1,31,199.50')).toBeTruthy()
    expect(screen.getByText('Gain/loss')).toBeTruthy()
    const previewCall = apiMock.mock.calls.find(([path]) => path === '/api/import/preview')
    const requestRows = (previewCall?.[1] as { json: { rows: Record<string, string>[] } }).json.rows
    expect(requestRows).toHaveLength(3)
    expect(requestRows[0]).toMatchObject({ product: 'Wireless mouse', amount_paid: '₹1,299.50', date_taken: '08/11/2025' })

    const originalOnline = Object.getOwnPropertyDescriptor(navigator, 'onLine')
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    window.dispatchEvent(new Event('offline'))
    await waitFor(() => expect((screen.getByTestId('import-commit-button') as HTMLButtonElement).disabled).toBe(true))
    expect(screen.getByTestId('import-offline-notice')).toBeTruthy()
    const previewsBeforeReconnect = apiMock.mock.calls.filter(([path]) => path === '/api/import/preview').length
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    window.dispatchEvent(new Event('online'))
    await waitFor(() => expect(apiMock.mock.calls.filter(([path]) => path === '/api/import/preview').length).toBeGreaterThan(previewsBeforeReconnect))
    await waitFor(() => expect((screen.getByTestId('import-commit-button') as HTMLButtonElement).disabled).toBe(false))

    fireEvent.click(screen.getByTestId('import-commit-button'))
    await new Promise((resolve) => window.setTimeout(resolve, 0))
    const calledPaths = apiMock.mock.calls.map(([path]) => path)
    if (!calledPaths.includes('/api/import/commit')) throw new Error(`No commit call; paths=${calledPaths.join(',')}; error=${screen.queryByTestId('import-error')?.textContent ?? 'none'}; disabled=${(screen.getByTestId('import-commit-button') as HTMLButtonElement).disabled}`)
    await screen.findByTestId('import-result-step')
    expect(screen.getByText('Import complete')).toBeTruthy()
    expect(apiMock.mock.calls.some(([path]) => path === '/api/import/commit')).toBe(true)
    if (originalOnline) Object.defineProperty(navigator, 'onLine', originalOnline)
  })

  it('terminates the parser worker when the user cancels file reading', async () => {
    const workers: { terminate: ReturnType<typeof vi.fn> }[] = []
    class HangingWorker {
      onmessage: ((event: MessageEvent) => void) | null = null
      onerror: (() => void) | null = null
      terminate = vi.fn()
      constructor() { workers.push(this) }
      postMessage() {}
    }
    vi.stubGlobal('Worker', HangingWorker)
    render(<MemoryRouter><UserContext.Provider value={user}><ImportPage /></UserContext.Provider></MemoryRouter>)
    const file = new File(['spreadsheet'], 'deals.csv', { type: 'text/csv' })
    Object.defineProperty(file, 'arrayBuffer', { value: async () => new ArrayBuffer(4) })
    fireEvent.change(screen.getByTestId('import-file-input'), { target: { files: [file] } })

    fireEvent.click(await screen.findByTestId('import-cancel-read'))

    expect(workers).toHaveLength(1)
    expect(workers[0].terminate).toHaveBeenCalledOnce()
    expect(screen.getByTestId('import-file-error').textContent).toBe('File reading cancelled.')
  })
})

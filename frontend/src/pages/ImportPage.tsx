import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, FileSpreadsheet } from 'lucide-react'
import { api, apiBlob } from '../lib/api'
import { useDeals, useUser } from '../data/hooks'
import { btn, input, PageTitle } from '../components/ui'
import { IMPORT_TARGETS, blankMapping, loadMapping, saveMapping, suggestMappings, type ColumnMapping, type ImportField } from '../imports/mapping'
import { countDataRows, isSupportedImportFile, MAX_IMPORT_FILE_BYTES, MAX_IMPORT_ROWS, suggestHeaderRow, type WorkbookPreview } from '../imports/workbook'
import { downloadCsvTemplate, downloadXlsxTemplate } from '../imports/template'
import { numberDeals } from '../lib/dealNumbers'

type Step = 'upload' | 'sheet' | 'map' | 'fix' | 'review' | 'result'
type DateOrder = 'dmy' | 'mdy'
type ReviewStatus = 'pending' | 'done'
type FormStatus = 'pending' | 'submitted'
type PaymentStatus = 'pending' | 'received' | 'disputed'
type StatusField = 'review_status' | 'form_status' | 'payment_status'
type Defaults = {
  platform: string
  mediator: string
  deal_type: string
  date_taken: string
  statuses: { review_status: ReviewStatus | ''; form_status: FormStatus | ''; payment_status: PaymentStatus | '' }
}
type PreviewRow = {
  row_number: number
  status: 'ok' | 'duplicate' | 'error'
  will_import: boolean
  duplicate_of: number | null
  duplicate_reason: string | null
  existing_deal_id?: string | null
  values: Record<string, unknown>
  errors: { field: string; reason: string }[]
  warnings: { field: string; reason: string }[]
}
type Preview = {
  rows: PreviewRow[]
  counts: { total: number; will_import: number; duplicates: number; errors: number }
  unrecognized_status_values: Partial<Record<StatusField, string[]>>
  mediators_to_create: string[]
  existing_mediators: { input_name: string; existing_name: string }[]
  reconciliation: { total_paid: string; total_refund: string; total_gain_loss: string; pending_refund: string }
}
type ImportJob = {
  id: string
  import_id: string
  filename: string | null
  status: 'committed' | 'undone' | 'failed'
  rows_total: number
  rows_imported: number
  rows_skipped_duplicate: number
  rows_failed: number
  mediators_created: number
  total_paid: string
  total_refund: string
  errors: { row: number; field: string; reason: string }[]
  created_at: string
  undone_at: string | null
}
type UndoResult = { job: ImportJob; deleted_deals: number; deleted_mediators: number; edited_deals_warning: number; warning: string }
type ApiOptions = {
  date_order: DateOrder
  duplicate_policy: 'skip' | 'import'
  value_maps: Partial<Record<StatusField, Record<string, string>>>
  defaults: Record<string, unknown>
}
type ParserResponse =
  | { type: 'opened'; sheets: WorkbookPreview[] }
  | { type: 'sheet'; name: string; rows: string[][] }
  | { type: 'error'; message: string }

const IMPORT_WORKER_TIMEOUT_MS = 30_000

const defaultValues = (): Defaults => ({
  platform: '', mediator: '', deal_type: '', date_taken: '',
  statuses: { review_status: '', form_status: '', payment_status: '' },
})
const STATUS_FIELDS: StatusField[] = ['review_status', 'form_status', 'payment_status']
const STATUS_VALUES: Record<StatusField, string[]> = {
  review_status: ['pending', 'done'],
  form_status: ['pending', 'submitted'],
  payment_status: ['pending', 'received', 'disputed'],
}
const humanize = (value: string) => value.replace(/_/g, ' ')
const inr = (value: string | number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value) || 0)

function useOnline() {
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  return online
}

function importId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16)
    return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16)
  })
}

function normalizedOptions(dateOrder: DateOrder, duplicatePolicy: 'skip' | 'import', valueMaps: ApiOptions['value_maps'], defaults: Defaults): ApiOptions {
  const plainDefaults: Record<string, unknown> = {}
  for (const key of ['platform', 'mediator', 'deal_type', 'date_taken'] as const) {
    if (defaults[key].trim()) plainDefaults[key] = defaults[key].trim()
  }
  const statuses = Object.fromEntries(Object.entries(defaults.statuses).filter(([, value]) => value))
  if (Object.keys(statuses).length) plainDefaults.statuses = statuses
  return { date_order: dateOrder, duplicate_policy: duplicatePolicy, value_maps: valueMaps, defaults: plainDefaults }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export default function ImportPage() {
  const me = useUser()
  const deals = useDeals()
  const numbering = useMemo(() => deals ? numberDeals(deals) : undefined, [deals])
  const online = useOnline()
  const workerRef = useRef<Worker | null>(null)
  const workerTimeoutRef = useRef<number | null>(null)
  const previewSequence = useRef(0)
  const [step, setStep] = useState<Step>('upload')
  const [fileName, setFileName] = useState<string | null>(null)
  const [sheets, setSheets] = useState<WorkbookPreview[]>([])
  const [sheetName, setSheetName] = useState('')
  const [rows, setRows] = useState<string[][]>([])
  const [headerIndex, setHeaderIndex] = useState(0)
  const [workerBusy, setWorkerBusy] = useState(false)
  const [fileError, setFileError] = useState('')
  const [mapping, setMapping] = useState<ColumnMapping>(blankMapping)
  const [confidence, setConfidence] = useState<Record<ImportField, 'high' | 'medium' | 'none'>>(() => suggestMappings([]).confidence)
  const [dateOrder, setDateOrder] = useState<DateOrder>('dmy')
  const [duplicatePolicy, setDuplicatePolicy] = useState<'skip' | 'import'>('skip')
  const [valueMaps, setValueMaps] = useState<ApiOptions['value_maps']>({})
  const [defaults, setDefaults] = useState<Defaults>(defaultValues)
  const [preview, setPreview] = useState<Preview | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [previewReload, setPreviewReload] = useState(0)
  const [previewTab, setPreviewTab] = useState<'ok' | 'duplicate' | 'error'>('ok')
  const [previewPage, setPreviewPage] = useState(0)
  const [committing, setCommitting] = useState(false)
  const [pendingImportId, setPendingImportId] = useState<string | null>(null)
  const [pageError, setPageError] = useState('')
  const [job, setJob] = useState<ImportJob | null>(null)
  const [undoResult, setUndoResult] = useState<UndoResult | null>(null)
  const [undoBusy, setUndoBusy] = useState(false)
  const [history, setHistory] = useState<ImportJob[]>([])
  const [historyBusy, setHistoryBusy] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [historyReload, setHistoryReload] = useState(0)

  const stopWorker = useCallback((error?: string) => {
    if (workerTimeoutRef.current !== null) window.clearTimeout(workerTimeoutRef.current)
    workerTimeoutRef.current = null
    workerRef.current?.terminate()
    workerRef.current = null
    if (error) setFileError(error)
    setWorkerBusy(false)
  }, [])
  const resetWorkerTimeout = useCallback((worker: Worker) => {
    if (workerTimeoutRef.current !== null) window.clearTimeout(workerTimeoutRef.current)
    workerTimeoutRef.current = window.setTimeout(() => {
      if (workerRef.current === worker) {
        stopWorker('Reading this file timed out. Choose it again or split it into smaller files.')
      }
    }, IMPORT_WORKER_TIMEOUT_MS)
  }, [stopWorker])

  const header = rows[headerIndex] ?? []
  const visibleRows = useMemo(() => rows.slice(0, 5), [rows])
  const nonEmptyRowData = useMemo(() => rows.slice(headerIndex + 1)
    .map((row, index) => ({ row, sourceLine: headerIndex + index + 2 }))
    .filter(({ row }) => row.some((cell) => cell.trim() !== '')), [rows, headerIndex])
  const dataRows = useMemo(() => nonEmptyRowData.map(({ row }) => {
    const result: Record<string, string> = {}
    for (const [field] of IMPORT_TARGETS) {
      const column = mapping[field]
      if (column !== null) result[field] = row[column] ?? ''
    }
    return result
  }), [nonEmptyRowData, mapping])
  const sourceLines = useMemo(() => nonEmptyRowData.map(({ sourceLine }) => sourceLine), [nonEmptyRowData])
  const options = useMemo(() => normalizedOptions(dateOrder, duplicatePolicy, valueMaps, defaults), [dateOrder, duplicatePolicy, valueMaps, defaults])

  const refreshHistory = useCallback(() => setHistoryReload((value) => value + 1), [])

  useEffect(() => {
    if (!online) {
      setHistoryBusy(false)
      setHistoryError('')
      return
    }
    let live = true
    setHistoryBusy(true)
    setHistoryError('')
    void api<ImportJob[]>('/api/import/jobs').then((items) => {
      if (live) setHistory(items)
    }).catch((error: unknown) => {
      if (live) setHistoryError(error instanceof Error ? error.message : 'Import history could not be loaded.')
    }).finally(() => { if (live) setHistoryBusy(false) })
    return () => { live = false }
  }, [online, historyReload])

  useEffect(() => () => {
    if (workerTimeoutRef.current !== null) window.clearTimeout(workerTimeoutRef.current)
    workerRef.current?.terminate()
  }, [])

  useEffect(() => {
    if (step !== 'fix' && step !== 'review') return
    if (!online) {
      setPreviewBusy(false)
      setPreviewError('Connect to the internet to validate these rows. Your file stays on this device.')
      return
    }
    if (!dataRows.length) {
      setPreview(null)
      setPreviewError('Choose a header row with at least one deal row.')
      return
    }
    const requestBody = { rows: dataRows, options }
    if (new TextEncoder().encode(JSON.stringify(requestBody)).length > 4.5 * 1024 * 1024) {
      setPreviewBusy(false)
      setPreviewError('The mapped rows are too large to preview in one request. Split the file into smaller files.')
      return
    }
    const sequence = ++previewSequence.current
    setPreviewBusy(true)
    setPreviewError('')
    const timer = window.setTimeout(() => {
      void api<Preview>('/api/import/preview', { method: 'POST', json: requestBody })
        .then((result) => {
          if (previewSequence.current !== sequence) return
          setPreview(result)
          setPreviewError('')
        })
        .catch((error: unknown) => {
          if (previewSequence.current !== sequence) return
          setPreviewError(error instanceof Error ? error.message : 'The preview could not be loaded.')
        })
        .finally(() => { if (previewSequence.current === sequence) setPreviewBusy(false) })
    }, 300)
    return () => {
      window.clearTimeout(timer)
      previewSequence.current += 1
    }
  }, [step, online, dataRows, options, previewReload])

  const chooseSheet = useCallback((name: string) => {
    const worker = workerRef.current
    if (!worker) return
    setSheetName(name)
    setRows([])
    setWorkerBusy(true)
    setFileError('')
    resetWorkerTimeout(worker)
    worker.postMessage({ type: 'sheet', name })
  }, [resetWorkerTimeout])

  const chooseFile = async (file: File | undefined) => {
    stopWorker()
    setFileError('')
    setFileName(null)
    setRows([])
    setSheets([])
    setHeaderIndex(0)
    setMapping(blankMapping())
    setPreview(null)
    setDateOrder('dmy')
    setDuplicatePolicy('skip')
    setValueMaps({})
    setDefaults(defaultValues())
    setPreviewError('')
    setPageError('')
    setPreviewReload(0)
    setPendingImportId(null)
    setJob(null)
    setUndoResult(null)
    setStep('upload')
    if (!file) return
    if (!isSupportedImportFile(file.name)) {
      setFileError('Choose an .xlsx, .xls or .csv file.')
      return
    }
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      setFileError('This file is larger than 5 MB. Split it into smaller files and try again.')
      return
    }
    if (!file.size) {
      setFileError('This file is empty. Choose another file.')
      return
    }
    setFileName(file.name)
    setWorkerBusy(true)
    const worker = new Worker(new URL('../imports/importParser.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    resetWorkerTimeout(worker)
    worker.onmessage = (event: MessageEvent<ParserResponse>) => {
      const response = event.data
      if (response.type === 'error') {
        stopWorker(response.message)
        return
      }
      if (response.type === 'opened') {
        setSheets(response.sheets)
        if (!response.sheets.length) {
          stopWorker('This file has no worksheets. Choose another file.')
          return
        }
        setSheetName(response.sheets[0].name)
        resetWorkerTimeout(worker)
        worker.postMessage({ type: 'sheet', name: response.sheets[0].name })
        return
      }
      stopWorker()
      setSheetName(response.name)
      setRows(response.rows)
      setHeaderIndex(suggestHeaderRow(response.rows))
      setStep('sheet')
    }
    worker.onerror = () => {
      stopWorker('This file could not be read. Check that it is a valid Excel or CSV file.')
    }
    try {
      const buffer = await file.arrayBuffer()
      if (workerRef.current !== worker) return
      resetWorkerTimeout(worker)
      worker.postMessage({ type: 'open', buffer }, [buffer])
    } catch {
      if (workerRef.current === worker) stopWorker('This file could not be opened on this device.')
    }
  }

  const loadMappingForHeader = () => {
    const remembered = loadMapping(localStorage, me.id, header)
    const suggested = suggestMappings(header)
    setMapping(remembered ?? suggested.mapping)
    setConfidence(suggested.confidence)
    setStep('map')
  }

  const updateMapping = (field: ImportField, value: string) => {
    const next = { ...mapping, [field]: value === '' ? null : Number(value) }
    setMapping(next)
    setPendingImportId(null)
    saveMapping(localStorage, me.id, header, next)
  }

  const setDefault = (key: keyof Omit<Defaults, 'statuses'>, value: string) => {
    setPendingImportId(null)
    setDefaults((previous) => ({ ...previous, [key]: value }))
  }
  const mappedRequiredFields = mapping.product !== null && mapping.amount_paid !== null

  const doCommit = async () => {
    if (!online) {
      setPageError('Connect to the internet before importing these rows.')
      return
    }
    if (!dataRows.length) {
      setPageError('There are no mapped deal rows to import.')
      return
    }
    setCommitting(true)
    setPageError('')
    const requestImportId = pendingImportId ?? importId()
    setPendingImportId(requestImportId)
    try {
      const result = await api<ImportJob>('/api/import/commit', {
        method: 'POST',
        json: { rows: dataRows, options, import_id: requestImportId, filename: fileName?.slice(0, 255) ?? null },
      })
      setJob(result)
      setUndoResult(null)
      setStep('result')
      setRows([])
      setSheets([])
      setFileName(null)
      setMapping(blankMapping())
      setPendingImportId(null)
      setPreview(null)
      setConfidence(suggestMappings([]).confidence)
      setDateOrder('dmy')
      setDuplicatePolicy('skip')
      setValueMaps({})
      setDefaults(defaultValues())
      setPreviewError('')
      setFileError('')
      workerRef.current?.terminate()
      workerRef.current = null
      refreshHistory()
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'The import could not be completed.')
    } finally {
      setCommitting(false)
    }
  }

  const undoImport = async (selected: ImportJob) => {
    if (!online || !window.confirm('Undo this import? Every deal created by it will be removed from your active list.')) return
    setUndoBusy(true)
    setPageError('')
    try {
      const result = await api<UndoResult>(`/api/import/jobs/${selected.id}/undo`, { method: 'POST', json: {} })
      setUndoResult(result)
      setJob(result.job)
      refreshHistory()
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'This import could not be undone.')
    } finally {
      setUndoBusy(false)
    }
  }

  const downloadErrors = async (selected: ImportJob) => {
    try {
      const blob = await apiBlob(`/api/import/jobs/${selected.id}/errors.csv`)
      downloadBlob(blob, `${selected.filename?.replace(/[^a-z0-9._-]/gi, '_') || 'import'}-errors.csv`)
    } catch (error) {
      setPageError(error instanceof Error ? error.message : 'The error report could not be downloaded.')
    }
  }

  const openHistoryItem = (item: ImportJob) => {
    setJob(item)
    setUndoResult(null)
    setPageError('')
    setStep('result')
  }

  const activeRows = preview?.rows.filter((row) => row.status === previewTab) ?? []
  const pageCount = Math.max(1, Math.ceil(activeRows.length / 50))
  const pageRows = activeRows.slice(previewPage * 50, (previewPage + 1) * 50)

  return (
    <div data-testid="import-page" className="import-page">
      <PageTitle right={<Link to="/settings" className="text-sm font-bold text-primary">Settings</Link>}>Import deals</PageTitle>
      {step === 'upload' && <p className="-mt-3 text-sm text-muted">Bring in your past deals from a spreadsheet. Your file is read on this device; only mapped cell values are sent for preview.</p>}
      {!online && <p data-testid="import-offline-notice" role="status" className="rounded-sm bg-danger-soft p-3 text-sm font-semibold text-danger">You are offline. You can choose a file, but preview and import need a connection.</p>}
      {pageError && <p role="alert" data-testid="import-error" className="rounded-sm bg-danger-soft p-3 text-sm font-semibold text-danger">{pageError}</p>}

      {step !== 'result' && <StepBar step={step} />}
      {(step === 'upload' || step === 'sheet') && <section data-testid="import-upload-step" className="import-stage-card">
        <h2 className="text-lg font-bold">{step === 'upload' ? '1. Choose a spreadsheet' : '2. Choose worksheet and header row'}</h2>
        {step === 'upload' && <label className="block text-sm font-semibold">
          Excel or CSV file (up to 5 MB)
          <input data-testid="import-file-input" className={`${input} import-file-input mt-2`} type="file" accept=".xlsx,.xls,.csv" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; void chooseFile(file) }} />
        </label>}
        {step === 'sheet' && <div data-testid="import-file-chip" className="import-file-chip">
          <FileSpreadsheet size={18} aria-hidden="true" />
          <span className="import-file-chip-name">{fileName ?? 'Spreadsheet'}</span>
          <button type="button" className="import-file-change" onClick={() => setStep('upload')}>Change</button>
        </div>}
        {workerBusy && <div role="status" className="flex items-center gap-2 text-sm text-muted">
          <span>Reading this file in the browser…</span>
          <button type="button" data-testid="import-cancel-read" className={btn.ghost} onClick={() => stopWorker('File reading cancelled.')}>Cancel</button>
        </div>}
        {fileError && <p data-testid="import-file-error" role="alert" className="text-sm font-semibold text-danger">{fileError}</p>}
        {step === 'upload' && <div className="import-template-links">
          <button type="button" className="import-template-link" onClick={downloadXlsxTemplate}>Download .xlsx template</button>
          <span aria-hidden="true">·</span>
          <button type="button" className="import-template-link" onClick={downloadCsvTemplate}>Download .csv template</button>
        </div>}
        {step === 'sheet' && rows.length > 0 && <div className="space-y-4 border-t border-line pt-4">
          <label className="block text-sm font-semibold">Worksheet
            <select data-testid="import-sheet-select" className={`${input} mt-1`} value={sheetName} onChange={(event) => chooseSheet(event.target.value)}>
              {sheets.map((sheet) => <option key={sheet.name} value={sheet.name}>{sheet.name}</option>)}
            </select>
          </label>
          <div className="import-sheet-rows">
            <p className="sr-only">First five rows of the selected worksheet</p>
            {visibleRows.map((row, rowIndex) => <div key={rowIndex} className={`import-sheet-row ${rowIndex === headerIndex ? 'is-header' : ''}`}>
              <div className="import-sheet-meta">
                <span>Row {rowIndex + 1}</span>
                <button type="button" data-testid={`import-header-row-${rowIndex + 1}`} onClick={() => setHeaderIndex(rowIndex)} className="import-sheet-header-button">
                  {rowIndex === headerIndex && <Check size={14} aria-hidden="true" />}
                  {rowIndex === headerIndex ? 'Header row' : 'Use as header'}
                </button>
              </div>
              <div className="import-sheet-cells">{row.slice(0, 4).map((cell, index) => <span key={index} className="import-sheet-cell" title={cell.slice(0, 200)}>{cell.slice(0, 60) || '—'}</span>)}</div>
            </div>)}
          </div>
          <p data-testid="import-row-count" className="text-sm text-muted">{countDataRows(rows, headerIndex).toLocaleString('en-IN')} deal rows found.</p>
          {(countDataRows(rows, headerIndex) > MAX_IMPORT_ROWS) && <p role="alert" className="text-sm font-semibold text-danger">This file has more than 5,000 deal rows. Split it into smaller files.</p>}
          <div className="import-actions"><button type="button" className={btn.ghost} onClick={() => setStep('upload')}>Back</button><button type="button" data-testid="import-continue-map" className={btn.primary} disabled={workerBusy || countDataRows(rows, headerIndex) < 1 || countDataRows(rows, headerIndex) > MAX_IMPORT_ROWS} onClick={loadMappingForHeader}>Continue to column mapping</button></div>
        </div>}
      </section>}

      {step === 'map' && <section data-testid="import-map-step" className="import-stage-card">
        <div><h2 className="text-lg font-bold">3. Match your columns</h2><p className="text-sm text-muted">{fileName} · {header.length} columns · {dataRows.length} deal rows</p></div>
        {!mappedRequiredFields && <p role="alert" className="rounded-sm bg-danger-soft p-3 text-sm font-semibold text-danger">Map Product and Amount paid to continue. Date taken can use a default on the next step.</p>}
        <div className="space-y-3">
          {IMPORT_TARGETS.map(([field, label]) => <label key={field} className="block text-sm font-semibold">
            <span className="flex items-center justify-between gap-2"><span>{label}{['product', 'amount_paid', 'date_taken'].includes(field) ? ' *' : ''}</span><span className="text-xs font-medium text-muted">{confidence[field] === 'high' ? 'High confidence match' : confidence[field] === 'medium' ? 'Possible match' : ''}</span></span>
            <select data-testid={`import-map-${field}`} className={`${input} mt-1`} value={mapping[field] ?? ''} onChange={(event) => updateMapping(field, event.target.value)}>
              <option value="">Don’t import this column</option>
              {header.map((name, index) => <option key={index} value={index}>{name ? `${name.slice(0, 120)}${name.length > 120 ? '…' : ''}` : `Column ${index + 1}`}</option>)}
            </select>
          </label>)}
        </div>
        <div className="import-actions"><button type="button" className={btn.ghost} onClick={() => setStep('sheet')}>Back</button><button type="button" data-testid="import-continue-fix" className={btn.primary} disabled={!mappedRequiredFields} onClick={() => setStep('fix')}>Continue to values</button></div>
      </section>}

      {step === 'fix' && <section data-testid="import-fix-step" className="import-stage-card">
        <div><h2 className="text-lg font-bold">4. Check dates and values</h2><p className="text-sm text-muted">The server validates these values when it previews and commits your import.</p></div>
        <fieldset className="space-y-2"><legend className="text-sm font-bold">Date order</legend>
        <div className="import-choice-group"><button type="button" data-testid="import-date-order-dmy" aria-pressed={dateOrder === 'dmy'} className={`import-choice-option ${dateOrder === 'dmy' ? 'is-selected' : ''}`} onClick={() => { setPendingImportId(null); setDateOrder('dmy') }}><span className="import-choice"><b>Day first</b><span>DD/MM/YYYY</span></span></button><button type="button" data-testid="import-date-order-mdy" aria-pressed={dateOrder === 'mdy'} className={`import-choice-option ${dateOrder === 'mdy' ? 'is-selected' : ''}`} onClick={() => { setPendingImportId(null); setDateOrder('mdy') }}><span className="import-choice"><b>Month first</b><span>MM/DD/YYYY</span></span></button></div>
        </fieldset>
        {mapping.date_taken === null && <label className="block text-sm font-semibold">Default date taken (required because no date column is mapped)<input data-testid="import-default-date" type="date" className={`${input} mt-1`} value={defaults.date_taken} onChange={(event) => setDefault('date_taken', event.target.value)} /></label>}
        <div className="rounded-sm border border-line p-3"><h3 className="text-sm font-bold">Parsed date preview</h3>
          {previewBusy && <p className="mt-2 text-sm text-muted">Checking dates…</p>}
          {preview?.rows.slice(0, 5).map((row) => <p key={row.row_number} data-testid="import-date-sample" className="mt-1 text-sm">Row {sourceLines[row.row_number - 1] ?? row.row_number}: {String(row.values.date_taken ?? 'Could not parse')}</p>)}
          {!previewBusy && !preview && <p className="mt-2 text-sm text-muted">Date samples appear after the server checks this file.</p>}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextDefault label="Default platform" value={defaults.platform} onChange={(value) => setDefault('platform', value)} />
          <TextDefault label="Default mediator" value={defaults.mediator} onChange={(value) => setDefault('mediator', value)} />
          <label className="block text-sm font-semibold">Default deal type<select data-testid="import-default-deal-type" className={`${input} mt-1`} value={defaults.deal_type} onChange={(event) => setDefault('deal_type', event.target.value)}><option value="">Use row value or app default</option><option value="review">Review</option><option value="rating_only">Rating only</option><option value="review_photo">Photo review</option><option value="review_video">Video review</option><option value="only_order">Only order</option><option value="negative_review">Negative review</option><option value="other">Other</option></select></label>
        </div>
        <div className="space-y-2"><h3 className="text-sm font-bold">Defaults for unmapped or blank status columns</h3><div className="grid gap-3 sm:grid-cols-3">
          {STATUS_FIELDS.map((field) => <label key={field} className="block text-sm font-semibold">{humanize(field)}<select data-testid={`import-default-${field}`} className={`${input} mt-1`} value={defaults.statuses[field]} onChange={(event) => { setPendingImportId(null); setDefaults((prev) => ({ ...prev, statuses: { ...prev.statuses, [field]: event.target.value as Defaults['statuses'][typeof field] } })) }}><option value="">Use row value or app default</option>{STATUS_VALUES[field].map((value) => <option key={value} value={value}>{humanize(value)}</option>)}</select></label>)}
        </div></div>
        <UnrecognizedMaps values={preview?.unrecognized_status_values ?? {}} maps={valueMaps} onChange={(field, raw, value) => { setPendingImportId(null); setValueMaps((previous) => {
          const next = { ...previous }
          const fieldMaps = { ...(next[field] ?? {}) }
          if (value) fieldMaps[raw] = value
          else delete fieldMaps[raw]
          if (Object.keys(fieldMaps).length) next[field] = fieldMaps
          else delete next[field]
          return next
        }) }} />
        {previewError && <div data-testid="import-preview-error" role="alert" className="space-y-2 text-sm font-semibold text-danger"><p>{previewError}</p><button type="button" className="font-bold underline" disabled={!online || previewBusy} onClick={() => setPreviewReload((value) => value + 1)}>Retry preview</button></div>}
        <div className="import-actions"><button type="button" className={btn.ghost} onClick={() => setStep('map')}>Back</button><button type="button" data-testid="import-continue-review" className={btn.primary} disabled={!online || previewBusy || !preview || (!!(mapping.date_taken === null && !defaults.date_taken))} onClick={() => { setPreviewTab('ok'); setPreviewPage(0); setStep('review') }}>Review validation</button></div>
      </section>}

      {step === 'review' && <section data-testid="import-review-step" className="import-stage-card">
        <div><h2 className="text-lg font-bold">5. Preview and validate</h2><p className="text-sm text-muted">The file has not been uploaded. Review every row before importing.</p></div>
        {previewBusy && <p role="status" className="text-sm text-muted">Refreshing validation…</p>}
        {previewError && <div data-testid="import-preview-error" role="alert" className="space-y-2 text-sm font-semibold text-danger"><p>{previewError}</p><button type="button" className="font-bold underline" disabled={!online || previewBusy} onClick={() => setPreviewReload((value) => value + 1)}>Retry preview</button></div>}
        {preview && <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Summary label="Rows" value={preview.counts.total} />
            <Summary label="Will import" value={preview.counts.will_import} />
            <Summary label="Duplicates" value={preview.counts.duplicates} />
            <Summary label="Errors" value={preview.counts.errors} />
          </div>
          <label className="flex items-center gap-3 rounded-sm border border-line p-3 text-sm font-semibold"><input data-testid="import-duplicate-policy" type="checkbox" checked={duplicatePolicy === 'import'} onChange={(event) => { setPendingImportId(null); setDuplicatePolicy(event.target.checked ? 'import' : 'skip') }} />Import duplicate rows too</label>
          <div className="import-money-list"><MoneySummary label="Paid" value={preview.reconciliation.total_paid} /><MoneySummary label="Net refund" value={preview.reconciliation.total_refund} /><MoneySummary label="Gain/loss" value={preview.reconciliation.total_gain_loss} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <ListSummary title="Mediators to create" items={preview.mediators_to_create} empty="No new mediators." />
            <ListSummary title="Matching existing mediators" items={preview.existing_mediators.map((item) => `${item.input_name} → ${item.existing_name}`)} empty="No existing matches." />
          </div>
          <div className="import-tabs" role="tablist" aria-label="Preview results">
            {([['ok', 'Ready', preview.counts.will_import], ['duplicate', 'Duplicates', preview.counts.duplicates], ['error', 'Errors', preview.counts.errors]] as const).map(([tab, label, count]) => <button key={tab} role="tab" aria-selected={previewTab === tab} data-testid={`import-tab-${tab}`} className={`import-tab ${previewTab === tab ? 'is-selected' : ''}`} onClick={() => { setPreviewTab(tab); setPreviewPage(0) }}><span>{label}</span><span className="import-tab-count">{count}</span></button>)}
          </div>
          <div className="space-y-2" data-testid="import-preview-rows">
            {pageRows.length === 0 ? <p className="rounded-sm border border-dashed border-line p-4 text-center text-sm text-muted">No rows in this tab.</p> : pageRows.map((row) => {
              const existingNumber = row.existing_deal_id ? numbering?.byId.get(row.existing_deal_id) : undefined
              return <article key={row.row_number} className="rounded-sm border border-line p-3 text-sm">
                <div className="flex items-start justify-between gap-2"><b>Row {sourceLines[row.row_number - 1] ?? row.row_number}</b><span className="rounded-pill bg-surface-2 px-2 py-1 text-xs font-bold">{row.status === 'ok' ? 'Ready' : row.status}</span></div>
                <p className="import-preview-line mt-1 font-semibold">{String(row.values.product ?? 'Unnamed product')} · {inr(String(row.values.amount_paid ?? 0))} · {String(row.values.date_taken ?? 'No date')}</p>
                {row.duplicate_reason && <p className="mt-1 text-muted">{row.duplicate_reason}</p>}
                {row.existing_deal_id && <p className="mt-1 text-muted">
                  {existingNumber ? <Link to={`/deals/${row.existing_deal_id}`} className="font-semibold text-primary">Existing deal #{existingNumber}</Link> : 'Existing deal (not on this device)'}
                </p>}
                {[...row.errors, ...row.warnings].map((issue, index) => <p key={`${issue.field}-${index}`} className={row.errors.includes(issue) ? 'mt-1 text-danger' : 'mt-1 text-muted'}>{humanize(issue.field)}: {issue.reason}</p>)}
              </article>
            })}
          </div>
          <div className="import-pagination"><span>Page {previewPage + 1} of {pageCount} · 50 rows per page</span><div className="import-pagination-actions"><button type="button" className={btn.ghost} disabled={!previewPage} onClick={() => setPreviewPage((page) => Math.max(0, page - 1))}>Previous</button><button type="button" className={btn.ghost} disabled={previewPage + 1 >= pageCount} onClick={() => setPreviewPage((page) => Math.min(pageCount - 1, page + 1))}>Next</button></div></div>
        </>}
        <div className="import-actions"><button type="button" className={btn.ghost} onClick={() => setStep('fix')}>Back</button><button type="button" data-testid="import-commit-button" className={btn.primary} disabled={!online || previewBusy || !preview || (preview.counts.will_import === 0 && preview.counts.errors === 0) || committing} onClick={() => void doCommit()}>{committing ? 'Importing…' : preview?.counts.will_import ? `Import ${preview.counts.will_import} deals` : 'Save error report'}</button></div>
        {committing && <p data-testid="import-progress" role="status" className="text-sm text-muted">Saving deals in the background… Keep this page open.</p>}
      </section>}

      {step === 'result' && <section data-testid="import-result-step" className="import-stage-card">
        {job ? <>
          <div><h2 className="text-lg font-bold">{job.status === 'undone' ? 'Import undone' : job.status === 'failed' ? 'Import finished with errors' : 'Import complete'}</h2><p className="text-sm text-muted">{job.filename || 'Spreadsheet import'} · {new Date(job.created_at).toLocaleString('en-IN')}</p></div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4"><Summary label="Imported" value={job.rows_imported} /><Summary label="Duplicates skipped" value={job.rows_skipped_duplicate} /><Summary label="Rows with errors" value={job.rows_failed} /><Summary label="Mediators created" value={job.mediators_created} /></div>
          <div className="import-money-list"><MoneySummary label="Paid" value={job.total_paid} /><MoneySummary label="Net refund" value={job.total_refund} /></div>
          {undoResult && <p data-testid="import-undo-result" role="status" className="rounded-sm bg-primary/10 p-3 text-sm">Removed {undoResult.deleted_deals} deals and {undoResult.deleted_mediators} mediators. {undoResult.warning}</p>}
          <div className="flex flex-col gap-2 sm:flex-row">
            {job.errors.length > 0 && <button type="button" data-testid="import-download-errors" className={btn.ghost} disabled={!online} title={!online ? 'Connect to download the report.' : undefined} onClick={() => void downloadErrors(job)}>Download error report</button>}
            {job.status === 'committed' && <button type="button" data-testid="import-undo-button" className={btn.danger} disabled={!online || undoBusy} title={!online ? 'Connect to undo this import.' : undefined} onClick={() => void undoImport(job)}>{undoBusy ? 'Undoing…' : 'Undo this import'}</button>}
            <button type="button" data-testid="import-new-button" className={btn.primary} onClick={() => { setStep('upload'); setJob(null); setUndoResult(null); setPageError('') }}>Import another file</button>
          </div>
          {!online && <p className="text-sm text-muted">Connect to the internet to download the error report or undo this import.</p>}
        </> : <p className="text-sm text-muted">Choose an import from history to view its result.</p>}
      </section>}

      <ImportHistory items={history} loading={historyBusy} error={historyError} online={online} onRefresh={refreshHistory} onOpen={openHistoryItem} />
      {!online && history.length === 0 && <p data-testid="import-history-offline" className="text-sm text-muted">Import history is available when you reconnect.</p>}
    </div>
  )
}

function StepBar({ step }: { step: Step }) {
  const items: [Step, string][] = [['upload', 'Choose file'], ['sheet', 'Worksheet'], ['map', 'Match columns'], ['fix', 'Check values'], ['review', 'Preview']]
  const current = items.findIndex(([id]) => id === step)
  return <div className="import-progress">
    <ol aria-label="Import steps" className="import-progress-track">{items.map(([id, label], index) => <li key={id} aria-current={id === step ? 'step' : undefined} className={index === current ? 'is-current' : index < current ? 'is-complete' : ''}><span className="sr-only">{label}</span></li>)}</ol>
    <p className="import-progress-label">Step {current + 1} of {items.length} · <b>{items[current][1]}</b></p>
  </div>
}

function TextDefault({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <label className="block text-sm font-semibold">{label}<input className={`${input} mt-1`} value={value} maxLength={100} onChange={(event) => onChange(event.target.value)} placeholder="Use row value" /></label>
}

function UnrecognizedMaps({ values, maps, onChange }: { values: Preview['unrecognized_status_values']; maps: ApiOptions['value_maps']; onChange: (field: StatusField, raw: string, value: string) => void }) {
  const rows = STATUS_FIELDS.flatMap((field) => (values[field] ?? []).map((raw) => ({ field, raw })))
  if (!rows.length) return <p data-testid="import-unrecognized-none" className="rounded-sm bg-primary/10 p-3 text-sm">No unrecognized status values. They will be normalized automatically.</p>
  return <div className="space-y-2"><h3 className="text-sm font-bold">Map unrecognized status values</h3>{rows.map(({ field, raw }) => <label key={`${field}:${raw}`} className="grid grid-cols-2 items-center gap-2 text-sm"><span className="truncate">{humanize(field)}: <b>{raw}</b></span><select className={input} aria-label={`Map ${field} value ${raw}`} value={maps[field]?.[raw] ?? ''} onChange={(event) => onChange(field, raw, event.target.value)}><option value="">Choose a status</option>{STATUS_VALUES[field].map((value) => <option key={value} value={value}>{humanize(value)}</option>)}</select></label>)}</div>
}

function Summary({ label, value }: { label: string; value: number }) {
  return <div className="rounded-sm border border-line p-3"><p className="text-xs text-muted">{label}</p><p className="text-lg font-extrabold">{value.toLocaleString('en-IN')}</p></div>
}

function MoneySummary({ label, value }: { label: string; value: string }) {
  return <div className="import-money-row"><span>{label}</span><b>{inr(value)}</b></div>
}

function ListSummary({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return <section className="rounded-sm border border-line p-3"><h3 className="text-sm font-bold">{title} ({items.length})</h3>{items.length ? <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-sm">{items.map((item) => <li key={item}>{item}</li>)}</ul> : <p className="mt-2 text-sm text-muted">{empty}</p>}</section>
}

function ImportHistory({ items, loading, error, online, onRefresh, onOpen }: { items: ImportJob[]; loading: boolean; error: string; online: boolean; onRefresh: () => void; onOpen: (item: ImportJob) => void }) {
  return <section data-testid="import-history" className="import-history-card">
    <div className="flex items-center justify-between"><h2 className="text-lg font-bold">Import history</h2><button type="button" className="text-sm font-bold text-primary" disabled={!online || loading} onClick={onRefresh}>Refresh</button></div>
    {loading ? <p role="status" className="text-sm text-muted">Loading imports…</p> : error ? <p role="alert" className="text-sm text-danger">{error}</p> : !online ? <p className="text-sm text-muted">Connect to view import history.</p> : items.length === 0 ? <p className="text-sm text-muted">No imports yet.</p> : <ul className="divide-y divide-line">{items.map((item) => <li key={item.id} className="py-2"><button type="button" data-testid="import-history-item" className="flex w-full items-center justify-between gap-3 text-left" onClick={() => onOpen(item)}><span className="min-w-0"><span className="block truncate text-sm font-bold">{item.filename || 'Spreadsheet import'}</span><span className="text-xs text-muted">{new Date(item.created_at).toLocaleDateString('en-IN')} · {item.rows_imported} imported · {item.status}</span></span><span aria-hidden className="text-primary">›</span></button></li>)}</ul>}
  </section>
}

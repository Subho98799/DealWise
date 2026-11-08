export const IMPORT_TARGETS = [
  ['product', 'Product'],
  ['platform', 'Platform'],
  ['mediator', 'Mediator'],
  ['deal_type', 'Deal type'],
  ['date_taken', 'Date taken'],
  ['amount_paid', 'Amount paid'],
  ['refund_amount', 'Refund amount'],
  ['commission', 'Commission'],
  ['review_deadline', 'Review deadline'],
  ['refund_form_deadline', 'Refund form deadline'],
  ['review_status', 'Review status'],
  ['form_status', 'Form status'],
  ['payment_status', 'Payment status'],
  ['payment_received_on', 'Payment received on'],
  ['notes', 'Notes'],
] as const

export type ImportField = (typeof IMPORT_TARGETS)[number][0]
export type ColumnMapping = Record<ImportField, number | null>
export type MappingConfidence = Record<ImportField, 'high' | 'medium' | 'none'>

const synonyms: Record<ImportField, string[]> = {
  product: ['product', 'product name', 'item', 'item name', 'name'],
  platform: ['platform', 'site', 'website', 'marketplace', 'store'],
  mediator: ['mediator', 'agent', 'seller', 'middleman', 'group'],
  deal_type: ['deal type', 'review type', 'type'],
  date_taken: ['date taken', 'order date', 'date', 'ordered on', 'purchase date', 'taken on'],
  amount_paid: ['amount paid', 'paid', 'price', 'amount', 'order amount', 'purchase price', 'cost'],
  refund_amount: ['refund amount', 'refunded amount', 'refund', 'to receive', 'expected refund'],
  commission: ['commission', 'commission amount', 'fee'],
  review_deadline: ['review deadline', 'review by', 'review due'],
  refund_form_deadline: ['refund form deadline', 'form deadline', 'refund form due'],
  review_status: ['review status', 'reviewed'],
  form_status: ['form status', 'refund form status'],
  payment_status: ['payment status', 'refund status', 'payment received'],
  payment_received_on: ['payment received on', 'received on', 'payment date'],
  notes: ['notes', 'note', 'remark', 'remarks', 'comment', 'comments'],
}

const normalizeHeader = (value: string) => value.slice(0, 512).toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
const emptyMapping = (): ColumnMapping => Object.fromEntries(IMPORT_TARGETS.map(([field]) => [field, null])) as ColumnMapping
const emptyConfidence = (): MappingConfidence => Object.fromEntries(IMPORT_TARGETS.map(([field]) => [field, 'none'])) as MappingConfidence

export function suggestMappings(headers: string[]): { mapping: ColumnMapping; confidence: MappingConfidence } {
  const mapping = emptyMapping()
  const confidence = emptyConfidence()
  const candidates: { field: ImportField; column: number; score: number }[] = []
  headers.forEach((header, column) => {
    const normalized = normalizeHeader(header)
    if (!normalized) return
    for (const [field] of IMPORT_TARGETS) {
      const aliases = synonyms[field].map(normalizeHeader)
      const exact = aliases.some((alias) => alias === normalized)
      const partial = !exact && aliases.some((alias) => normalized.includes(alias) || alias.includes(normalized))
      if (exact) candidates.push({ field, column, score: 100 })
      else if (partial && normalized.length >= 4) candidates.push({ field, column, score: 65 })
    }
  })
  candidates.sort((a, b) => b.score - a.score || a.column - b.column)
  const assignedColumns = new Set<number>()
  const assignedFields = new Set<ImportField>()
  for (const candidate of candidates) {
    if (assignedColumns.has(candidate.column) || assignedFields.has(candidate.field)) continue
    mapping[candidate.field] = candidate.column
    confidence[candidate.field] = candidate.score === 100 ? 'high' : 'medium'
    assignedColumns.add(candidate.column)
    assignedFields.add(candidate.field)
  }
  return { mapping, confidence }
}

export function headerSetKey(headers: string[]): string {
  const canonical = headers.map(normalizeHeader).sort().join('\u001f')
  let hash = 14695981039346656037n
  const mask = (1n << 64n) - 1n
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= BigInt(canonical.charCodeAt(index))
    hash = (hash * 1099511628211n) & mask
  }
  return `${headers.length}-${hash.toString(36)}`
}

export function saveMapping(storage: Storage, userId: string, headers: string[], mapping: ColumnMapping): void {
  const key = `${STORAGE_PREFIX}import-map:${encodeURIComponent(userId)}:${encodeURIComponent(headerSetKey(headers))}`
  const selected = Object.fromEntries(IMPORT_TARGETS.map(([field]) => {
    const column = mapping[field]
    if (column === null || column >= headers.length) return [field, null]
    const normalized = normalizeHeader(headers[column])
    const occurrence = headers.slice(0, column).filter((header) => normalizeHeader(header) === normalized).length
    return [field, normalized.length <= 512 ? { header: normalized, occurrence } : null]
  }))
  try {
    storage.setItem(key, JSON.stringify({ selected }))
  } catch {
    // Mapping persistence is optional; importing still works when local storage is full or disabled.
  }
}

export function loadMapping(storage: Storage, userId: string, headers: string[]): ColumnMapping | null {
  const key = `${STORAGE_PREFIX}import-map:${encodeURIComponent(userId)}:${encodeURIComponent(headerSetKey(headers))}`
  try {
    const saved = JSON.parse(storage.getItem(key) ?? 'null') as { selected?: Partial<Record<ImportField, { header: string; occurrence: number } | null>> } | null
    if (!saved || typeof saved !== 'object') return null
    return Object.fromEntries(IMPORT_TARGETS.map(([field]) => {
      const value = saved.selected?.[field]
      if (!value) return [field, null]
      const matches = headers.map((header, index) => ({ header: normalizeHeader(header), index })).filter((entry) => entry.header === value.header)
      return [field, matches[value.occurrence]?.index ?? null]
    })) as ColumnMapping
  } catch {
    return null
  }
}

export function blankMapping(): ColumnMapping {
  return emptyMapping()
}

import { STORAGE_PREFIX } from '../config/app'


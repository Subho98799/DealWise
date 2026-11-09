import * as XLSX from 'xlsx'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const output = fileURLToPath(new URL('../src/imports/fixtures/', import.meta.url))
await mkdir(output, { recursive: true })

const rows = [
  ['Deal history export', '', '', '', '', '', '', '', '', '', '', '', ''],
  ['Item name', 'Marketplace', 'Agent', 'Deal type', 'Order Date', 'Price Paid', 'Less', 'Commission', 'Refunded Amount', 'Review Status', 'Form Status', 'Payment Status', 'Remarks'],
  ['Wireless mouse', 'Amazon', 'Priya Deals', 'Review', '08/11/2025', '₹1,299.50', '100', '200', 'Rs. 1,399.50', 'waiting', 'submitted', 'pending', 'Fake example row'],
  ['', '', '', '', '', '', '', '', '', '', '', '', ''],
  ['Wireless mouse', 'Amazon', 'priya-deals', 'Review', '08/11/2025', '₹1,299.50', '100', '200', 'Rs. 1,399.50', 'waiting', 'submitted', 'pending', 'Duplicate example row'],
  ['Phone stand', 'Flipkart', 'New Agent', 'Video review', 'November 8, 2025', '1,29,900', '', '0', '0', 'mystery', 'not yet', 'disputed', 'Fake status value'],
]

const workbook = XLSX.utils.book_new()
const sheet = XLSX.utils.aoa_to_sheet(rows)
sheet['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }]
XLSX.utils.book_append_sheet(workbook, sheet, 'Deals')
await writeFile(path.join(output, 'messy-deals.xlsx'), XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' }))
await writeFile(path.join(output, 'messy-deals.xls'), XLSX.write(workbook, { bookType: 'xls', type: 'buffer' }))

const csv = XLSX.utils.sheet_to_csv(sheet)
await writeFile(path.join(output, 'messy-deals.csv'), `\uFEFF${csv}`, 'utf8')

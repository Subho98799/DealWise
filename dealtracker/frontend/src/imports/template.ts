export const TEMPLATE_HEADERS = [
  'Product', 'Platform', 'Mediator', 'Deal type', 'Date taken', 'Amount paid', 'Refund amount', 'Commission',
  'Review deadline', 'Refund form deadline', 'Review status', 'Form status', 'Payment status', 'Payment received on', 'Notes',
]

const EXAMPLE_ROW = [
  'Insulated water bottle', 'Amazon', 'Priya Deals', 'Review', '08/11/2026', '₹1,299.00', '1,500', '0',
  '15/11/2026', '20/11/2026', 'Pending', 'Not yet', 'Pending', '', 'Example row — replace or remove this row',
]

function makeWorkbook(XLSX: typeof import('xlsx')) {
  const sheet = XLSX.utils.aoa_to_sheet([TEMPLATE_HEADERS, EXAMPLE_ROW])
  sheet['!cols'] = TEMPLATE_HEADERS.map((header) => ({ wch: Math.max(15, header.length + 3) }))
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Deals')
  return { workbook, sheet }
}

export async function downloadXlsxTemplate(): Promise<void> {
  const XLSX = await import('xlsx')
  const { workbook } = makeWorkbook(XLSX)
  XLSX.writeFileXLSX(workbook, 'dealwise-import-template.xlsx')
}

export async function downloadCsvTemplate(): Promise<void> {
  const XLSX = await import('xlsx')
  const { sheet } = makeWorkbook(XLSX)
  const blob = new Blob([`\uFEFF${XLSX.utils.sheet_to_csv(sheet)}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'dealwise-import-template.csv'
  link.click()
  URL.revokeObjectURL(url)
}

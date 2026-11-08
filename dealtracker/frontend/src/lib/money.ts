// Money is a decimal STRING ("1299.50") on the wire and integer paise in arithmetic. Never floats.
const MONEY_RE = /^(\d{1,8})(?:\.(\d{1,2}))?$/
export const MAX_PAISE = 10_000_000 * 100

export function isValidMoney(s: string): boolean {
  const m = MONEY_RE.exec(s.trim())
  return !!m && toPaise(s) <= MAX_PAISE
}

export function toPaise(s: string | null | undefined): number {
  if (s == null || s === '') return 0
  const str = String(s).trim()
  const neg = str.startsWith('-')
  const [i, f = ''] = str.replace(/^-/, '').split('.')
  const v = Number(i) * 100 + Number((f + '00').slice(0, 2))
  return neg ? -v : v
}

export function fromPaise(p: number): string {
  const a = Math.abs(p)
  return `${p < 0 ? '-' : ''}${Math.floor(a / 100)}.${String(a % 100).padStart(2, '0')}`
}

function groupIndian(int: string): string {
  if (int.length <= 3) return int
  const last3 = int.slice(-3)
  const rest = int.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',')
  return `${rest},${last3}`
}

/** ₹1,23,456.00 — accepts a decimal string or integer paise. */
export function formatINR(v: string | number): string {
  const s = typeof v === 'number' ? fromPaise(v) : fromPaise(toPaise(v))
  const neg = s.startsWith('-')
  const [i, f] = s.replace('-', '').split('.')
  return `${neg ? '−' : ''}₹${groupIndian(i)}.${f}`
}

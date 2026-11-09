const INTERNAL_ORIGIN = 'https://dealwise.invalid'

export function safeReturnPath(value: unknown): string {
  if (
    typeof value !== 'string'
    || value.length > 512
    || !value.startsWith('/')
    || value.startsWith('//')
    || value.includes('\\')
    || /[\u0000-\u001f\u007f]/.test(value)
  ) return '/'

  try {
    return new URL(value, INTERNAL_ORIGIN).origin === INTERNAL_ORIGIN ? value : '/'
  } catch {
    return '/'
  }
}

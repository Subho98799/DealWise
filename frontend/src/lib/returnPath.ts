const INTERNAL_ORIGIN = 'https://dealwise.invalid'

export function safeReturnPath(value: unknown): string {
  if (
    typeof value !== 'string'
    || value.length > 512
    || !value.startsWith('/')
    || value.startsWith('//')
    || value.includes('\\')
    || [...value].some((character) => {
      const code = character.charCodeAt(0)
      return code < 32 || code === 127
    })
  ) return '/'

  try {
    return new URL(value, INTERNAL_ORIGIN).origin === INTERNAL_ORIGIN ? value : '/'
  } catch {
    return '/'
  }
}

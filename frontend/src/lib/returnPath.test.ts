import { describe, expect, it } from 'vitest'
import { safeReturnPath } from './returnPath'

describe('safeReturnPath', () => {
  it.each(['/', '/settings', '/deals?status=pending', '/deals#today'])(
    'accepts internal route %s',
    (path) => expect(safeReturnPath(path)).toBe(path),
  )

  it.each([
    'https://evil.example/',
    'http://evil.example/',
    '//evil.example/path',
    '///evil.example/path',
    '/\\evil.example/path',
    '\\\\evil.example/path',
    'javascript:alert(1)',
    '',
    null,
    12,
  ])('rejects non-internal destination %s', (path) => {
    expect(safeReturnPath(path)).toBe('/')
  })
})

import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { usePageMeta } from './pageMeta'
import { SITE_URL } from '../config/seo'

function Page({ jsonLd }: { jsonLd?: unknown }) {
  usePageMeta({ title: 'DealBook page', description: 'A page about review deals.', path: '/privacy', jsonLd })
  return null
}

afterEach(cleanup)

describe('usePageMeta', () => {
  it('writes an absolute canonical, social tags and indexable robots', () => {
    render(<Page />)
    expect(document.title).toBe('DealBook page')
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute('content')).toBe('A page about review deals.')
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(`${SITE_URL}/privacy`)
    expect(document.head.querySelector('meta[property="og:image"]')?.getAttribute('content')).toBe(`${SITE_URL}/og-cover.png`)
    expect(document.head.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe(`${SITE_URL}/privacy`)
    expect(document.head.querySelector('meta[name="twitter:card"]')?.getAttribute('content')).toBe('summary_large_image')
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toContain('index')
  })

  it('adds and removes page structured data', () => {
    const { unmount } = render(<Page jsonLd={{ '@type': 'FAQPage' }} />)
    const script = document.getElementById('page-json-ld')
    expect(script?.getAttribute('type')).toBe('application/ld+json')
    expect(JSON.parse(script!.textContent!)).toEqual({ '@type': 'FAQPage' })
    unmount()
    expect(document.getElementById('page-json-ld')).toBeNull()
  })
})

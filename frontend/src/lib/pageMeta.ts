import { useEffect } from 'react'
import { APP_NAME } from '../config/app'

type PageMeta = {
  title: string
  description: string
  path: string
}

function upsertMeta(attribute: 'name' | 'property', key: string, content: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`)
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute(attribute, key)
    document.head.append(tag)
  }
  tag.setAttribute('content', content)
}

export function usePageMeta({ title, description, path }: PageMeta) {
  useEffect(() => {
    if (!title || !description) return
    const absoluteUrl = new URL(path, window.location.origin).href
    const image = new URL('/icons/icon-512.png', window.location.origin).href
    document.title = title
    upsertMeta('name', 'description', description)
    upsertMeta('property', 'og:site_name', APP_NAME)
    upsertMeta('property', 'og:type', 'website')
    upsertMeta('property', 'og:title', title)
    upsertMeta('property', 'og:description', description)
    upsertMeta('property', 'og:url', absoluteUrl)
    upsertMeta('property', 'og:image', image)
    upsertMeta('name', 'twitter:card', 'summary')
    upsertMeta('name', 'twitter:title', title)
    upsertMeta('name', 'twitter:description', description)
    upsertMeta('name', 'twitter:image', image)
    let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
    if (!canonical) {
      canonical = document.createElement('link')
      canonical.rel = 'canonical'
      document.head.append(canonical)
    }
    canonical.href = absoluteUrl
  }, [path, title, description])
}

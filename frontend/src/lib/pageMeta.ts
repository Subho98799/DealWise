import { useEffect } from 'react'
import { APP_NAME } from '../config/app'
import { SEO_IMAGE_URL, SITE_KEYWORDS, SITE_URL, SOCIAL_IMAGE } from '../config/seo'

type PageMeta = {
  title: string
  description: string
  path: string
  keywords?: string
  jsonLd?: unknown
  noIndex?: boolean
}

const JSON_LD_ID = 'page-json-ld'

function upsertMeta(attribute: 'name' | 'property', key: string, content: string) {
  let tag = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`)
  if (!tag) {
    tag = document.createElement('meta')
    tag.setAttribute(attribute, key)
    document.head.append(tag)
  }
  tag.setAttribute('content', content)
}

function upsertLink(rel: string, href: string) {
  let link = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!link) {
    link = document.createElement('link')
    link.rel = rel
    document.head.append(link)
  }
  link.href = href
}

export function usePageMeta({ title, description, path, keywords = SITE_KEYWORDS, jsonLd, noIndex = false }: PageMeta) {
  useEffect(() => {
    if (!title || !description) return
    const absoluteUrl = new URL(path, SITE_URL).href
    document.title = title
    upsertMeta('name', 'description', description)
    upsertMeta('name', 'keywords', keywords)
    upsertMeta('name', 'robots', noIndex ? 'noindex, nofollow' : 'index, follow, max-image-preview:large, max-snippet:-1')
    upsertMeta('property', 'og:site_name', APP_NAME)
    upsertMeta('property', 'og:type', 'website')
    upsertMeta('property', 'og:locale', 'en_IN')
    upsertMeta('property', 'og:title', title)
    upsertMeta('property', 'og:description', description)
    upsertMeta('property', 'og:url', absoluteUrl)
    upsertMeta('property', 'og:image', SEO_IMAGE_URL)
    upsertMeta('property', 'og:image:width', String(SOCIAL_IMAGE.width))
    upsertMeta('property', 'og:image:height', String(SOCIAL_IMAGE.height))
    upsertMeta('property', 'og:image:alt', SOCIAL_IMAGE.alt)
    upsertMeta('name', 'twitter:card', 'summary_large_image')
    upsertMeta('name', 'twitter:title', title)
    upsertMeta('name', 'twitter:description', description)
    upsertMeta('name', 'twitter:image', SEO_IMAGE_URL)
    upsertMeta('name', 'twitter:image:alt', SOCIAL_IMAGE.alt)
    upsertLink('canonical', absoluteUrl)

    document.getElementById(JSON_LD_ID)?.remove()
    if (jsonLd) {
      const script = document.createElement('script')
      script.id = JSON_LD_ID
      script.type = 'application/ld+json'
      script.textContent = JSON.stringify(jsonLd).replace(/</g, '\\u003c')
      document.head.append(script)
    }
    return () => document.getElementById(JSON_LD_ID)?.remove()
  }, [description, jsonLd, keywords, noIndex, path, title])
}

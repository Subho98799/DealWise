import { platformSlug } from '../lib/platforms'

const logos = import.meta.glob('../assets/platforms/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

const KNOWN = new Set(['amazon', 'flipkart', 'myntra', 'meesho', 'ajio', 'nykaa', 'blinkit', 'zepto'])
const FALLBACKS = ['alt-1', 'alt-2', 'alt-3', 'alt-4', 'alt-5', 'alt-6']

function fallbackTone(slug: string): string {
  let hash = 7
  for (const character of slug) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  return FALLBACKS[hash % FALLBACKS.length]
}

export function platformColor(name: string): string {
  const slug = platformSlug(name)
  return `var(--color-platform-${KNOWN.has(slug) ? slug : fallbackTone(slug)})`
}

export function PlatformBadge({ platform, size = 30 }: { platform: string | null | undefined; size?: number }) {
  const name = platform?.trim()
  if (!name) {
    return <span className="platform-badge platform-badge-empty" style={{ width: size, height: size }} aria-label="No platform" role="img">
      <span aria-hidden="true">–</span>
    </span>
  }
  const logo = logos[`../assets/platforms/${platformSlug(name)}.svg`]
  return <span className="platform-badge" role="img" aria-label={name} title={name}
    style={{ width: size, height: size, fontSize: size / 2.2, color: platformColor(name) }}>
    {logo
      ? <span className="platform-badge-logo" aria-hidden="true"
          style={{ WebkitMaskImage: `url(${logo})`, maskImage: `url(${logo})` }} />
      : <span className="platform-badge-mark" aria-hidden="true">{name[0]?.toUpperCase()}</span>}
  </span>
}

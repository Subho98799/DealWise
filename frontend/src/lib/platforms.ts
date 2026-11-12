export const POPULAR_PLATFORMS = ['Amazon', 'Flipkart', 'Myntra', 'Meesho', 'Ajio', 'Nykaa', 'Tata CLiQ', 'JioMart', 'Snapdeal']

export const platformSlug = (name: string) => name.trim().toLowerCase().replace(/[^a-z0-9]/g, '')

/** One entry per platform, ignoring case and surrounding spaces. The first spelling saved wins. */
export function mergePlatforms(names: readonly (string | null | undefined)[]): string[] {
  const seen = new Map<string, string>()
  for (const raw of names) {
    const name = raw?.trim()
    if (!name) continue
    const slug = platformSlug(name)
    if (slug && !seen.has(slug)) seen.set(slug, name)
  }
  return [...seen.values()]
}

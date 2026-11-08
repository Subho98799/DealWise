export function Avatar({ name, size = 56 }: { name: string | null; url: string | null; size?: number }) {
  const initials = (name ?? '?')
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const tone = [...(name ?? '?')].reduce((hash, character) => (hash * 31 + character.charCodeAt(0)) >>> 0, 7) % 5
  return (
    <span
      data-testid="user-avatar-fallback"
      role="img"
      aria-label={`${name ?? 'User'} avatar`}
      className="grid shrink-0 place-items-center rounded-pill font-display font-bold text-ink"
      data-tone={tone}
      style={{ width: size, height: size, fontSize: size / 2.6, backgroundColor: `var(--color-avatar-${String.fromCharCode(97 + tone)})` }}
    >
      {initials}
    </span>
  )
}

import { useState } from 'react'

export function Avatar({ name, url, size = 56 }: { name: string | null; url: string | null; size?: number }) {
  const [broken, setBroken] = useState(false)
  const initials = (name ?? '?')
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  if (url && !broken) {
    return (
      <img
        data-testid="user-avatar"
        src={url}
        alt=""
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        className="rounded-pill border-2 border-surface object-cover shadow-card"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <span
      data-testid="user-avatar-fallback"
      className="grid place-items-center rounded-pill bg-primary font-bold text-primary-ink"
      style={{ width: size, height: size, fontSize: size / 2.6 }}
    >
      {initials}
    </span>
  )
}

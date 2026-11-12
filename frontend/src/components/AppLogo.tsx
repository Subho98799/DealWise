export function AppLogo({ size = 32, className = '' }: { size?: number; className?: string }) {
  return <img src="/icons/icon-192.png" alt="" width={size} height={size} aria-hidden="true" decoding="async" className={`app-logo ${className}`} />
}

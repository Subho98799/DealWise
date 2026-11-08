import type { ReactNode } from 'react'

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div data-testid="skeleton" className="space-y-3" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => <div key={i} className="h-24 animate-pulse rounded-lg bg-surface-2" />)}
    </div>
  )
}

export function Empty({ title, children, testId }: { title: string; children?: ReactNode; testId?: string }) {
  return (
    <div data-testid={testId ?? 'empty-state'} className="rounded-lg border border-dashed border-line bg-surface p-6 text-center">
      <p className="font-bold">{title}</p>
      {children && <div className="mt-2 text-sm text-muted">{children}</div>}
    </div>
  )
}

export function PageTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-5 flex items-center justify-between gap-3">
      <h1 className="text-2xl font-extrabold tracking-tight">{children}</h1>
      {right}
    </div>
  )
}

export const btn = {
  primary: 'min-h-[48px] rounded-pill bg-primary px-5 text-sm font-bold text-primary-ink transition-transform active:scale-[0.98] disabled:opacity-50',
  ghost: 'min-h-[48px] rounded-pill border border-line bg-surface px-5 text-sm font-bold transition-transform active:scale-[0.98]',
  danger: 'min-h-[48px] rounded-pill bg-danger-soft px-5 text-sm font-bold text-danger transition-transform active:scale-[0.98]',
}
export const input = 'min-h-[48px] w-full rounded-sm border border-line bg-surface px-4 text-base outline-none focus:border-primary'

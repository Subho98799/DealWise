import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { AlertTriangle, Circle, CircleCheck, Clock3, X, type LucideIcon } from 'lucide-react'

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

const buttonVariants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-primary-ink shadow-card hover:brightness-105',
  secondary: 'border border-line bg-surface text-ink hover:bg-surface-2',
  ghost: 'bg-transparent text-ink hover:bg-surface-2',
  danger: 'bg-danger-soft text-danger hover:brightness-95',
}

export function Button({ variant = 'primary', className = '', type = 'button', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button type={type} className={`ui-button ${buttonVariants[variant]} ${className}`} {...props} />
}

export function IconButton({ label, className = '', children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button type="button" aria-label={label} title={label} className={`ui-icon-button ${className}`} {...props}>{children}</button>
}

export function Card({ children, className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`ui-card ${className}`} {...props}>{children}</div>
}

type ChipVariant = 'neutral' | 'brand' | 'success' | 'warning' | 'danger'
const chipStyles: Record<ChipVariant, string> = {
  neutral: 'bg-surface-2 text-ink',
  brand: 'bg-brand-soft text-primary',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
}
const chipIcons: Record<ChipVariant, LucideIcon> = {
  neutral: Circle,
  brand: Circle,
  success: CircleCheck,
  warning: Clock3,
  danger: AlertTriangle,
}

export function Chip({ children, variant = 'neutral', icon: Icon, className = '', testId }: {
  children: ReactNode
  variant?: ChipVariant
  icon?: LucideIcon
  className?: string
  testId?: string
}) {
  const StatusIcon = Icon ?? chipIcons[variant]
  return <span data-testid={testId} className={`ui-chip ${chipStyles[variant]} ${className}`}><StatusIcon size={14} strokeWidth={2.2} aria-hidden="true" />{children}</span>
}

export function Stat({ label, value, icon: Icon, className = '' }: { label: string; value: ReactNode; icon: LucideIcon; className?: string }) {
  return <Card className={`ui-stat ${className}`}>
    <span className="grid h-9 w-9 place-items-center rounded-control bg-brand-soft text-primary"><Icon size={18} aria-hidden="true" /></span>
    <span className="mt-3 block text-xs font-semibold text-muted">{label}</span>
    <span className="money mt-1 block truncate font-display text-xl font-bold tracking-tight">{value}</span>
  </Card>
}

export function Sheet({ open, title, onClose, children, labelledBy, closeTestId }: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  labelledBy?: string
  closeTestId?: string
}) {
  const generatedId = useId()
  const sheetRef = useRef<HTMLDivElement>(null)
  const titleId = labelledBy ?? generatedId
  useEffect(() => {
    if (!open) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', closeOnEscape)
    sheetRef.current?.focus()
    return () => {
      document.body.style.overflow = previous
      window.removeEventListener('keydown', closeOnEscape)
    }
  }, [open, onClose])
  if (!open) return null
  return <div className="ui-sheet-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section ref={sheetRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} className="ui-sheet">
      <div className="ui-sheet-handle" aria-hidden="true" />
      <header className="mb-4 flex items-center justify-between gap-3">
        <h2 id={titleId} className="font-display text-xl font-bold">{title}</h2>
        <IconButton label="Close" onClick={onClose} data-testid={closeTestId}><X size={20} aria-hidden="true" /></IconButton>
      </header>
      {children}
    </section>
  </div>
}

export function Toast({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return <div role="status" aria-live="polite" aria-atomic="true" className="ui-toast"><span className="min-w-0 flex-1">{children}</span>{action}</div>
}

export function Skeleton({ rows = 3, className = '' }: { rows?: number; className?: string }) {
  return <div data-testid="skeleton" className={`space-y-3 ${className}`} aria-busy="true" aria-label="Loading">
    {Array.from({ length: rows }, (_, i) => <div key={i} className="ui-skeleton" />)}
  </div>
}

export function EmptyState({ title, children, testId }: { title: string; children?: ReactNode; testId?: string }) {
  return <div data-testid={testId ?? 'empty-state'} className="ui-empty-state">
    <svg className="mx-auto mb-4 h-20 w-20 text-primary" viewBox="0 0 96 80" fill="none" aria-hidden="true">
      <path d="M12 62.5c9.5-12 20.5-18 34-18s24.5 6 38 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="5 7" />
      <rect x="20" y="13" width="56" height="48" rx="12" fill="var(--color-brand-soft)" />
      <path d="M34 31h28M34 41h18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      <circle cx="68" cy="58" r="11" fill="var(--color-success-soft)" />
      <path d="m63.5 58 3 3 6-6" stroke="var(--color-success)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
    <p className="font-display text-base font-bold">{title}</p>
    {children && <div className="mt-2 text-sm leading-relaxed text-muted">{children}</div>}
  </div>
}

export function Empty({ title, children, testId }: { title: string; children?: ReactNode; testId?: string }) {
  return <EmptyState title={title} testId={testId}>{children}</EmptyState>
}

export function SegmentedControl<T extends string>({ label, value, options, onChange }: {
  label: string
  value: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  const id = useId()
  return <div role="group" aria-label={label} className="ui-segmented">
    {options.map((option) => <button key={option.value} type="button" aria-pressed={value === option.value}
      aria-describedby={id} className={value === option.value ? 'ui-segmented-option is-selected' : 'ui-segmented-option'}
      onClick={() => onChange(option.value)}>{option.label}</button>)}
    <span id={id} className="sr-only">Choose {label.toLowerCase()}</span>
  </div>
}

export function PageTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return <div className="mb-5 flex items-center justify-between gap-3">
    <h1 className="font-display text-2xl font-bold tracking-tight">{children}</h1>{right}
  </div>
}

export const btn = {
  primary: 'ui-button bg-primary text-primary-ink shadow-card',
  ghost: 'ui-button border border-line bg-surface text-ink',
  danger: 'ui-button bg-danger-soft text-danger',
  secondary: 'ui-button border border-line bg-surface text-ink',
}

export const input = 'ui-input'

import { AppLogo } from './AppLogo'

type Props = {
  message: string
  hint?: string
  action?: { label: string; onClick: () => void }
}

export function Splash({ message, hint, action }: Props) {
  return (
    <div data-testid="splash" className="flex min-h-dvh flex-col items-center justify-center gap-3 px-gutter text-center">
      <AppLogo size={72} className="splash-logo" />
      {!action && <span className="h-10 w-10 animate-spin rounded-full border-4 border-line border-t-primary" aria-hidden />}
      <p data-testid="splash-message" className="text-base font-semibold">{message}</p>
      {hint && <p className="text-sm text-muted">{hint}</p>}
      {action && (
        <button
          data-testid="splash-retry-button"
          onClick={action.onClick}
          className="mt-2 rounded-pill bg-primary px-6 py-3 text-sm font-bold text-primary-ink transition-transform active:scale-95"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}

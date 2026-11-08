import { Navigate, useLocation, useSearchParams } from 'react-router-dom'
import { googleLoginHref, useMe } from '../lib/auth'

const ERRORS: Record<string, string> = {
  access_denied: 'Google sign-in was cancelled.',
  email_unverified: 'Your Google email is not verified. Verify it with Google and try again.',
  oauth_failed: 'Sign-in could not be completed. Please try again.',
}

export default function LoginPage() {
  const me = useMe()
  const location = useLocation()
  const [params] = useSearchParams()
  const next = (location.state as { next?: string } | null)?.next ?? '/'
  const error = params.get('error')

  if (me.isSuccess) return <Navigate to={next} replace />

  return (
    <div className="safe-top safe-bottom mx-auto flex min-h-dvh max-w-md flex-col px-gutter">
      <div className="flex flex-1 flex-col justify-end pb-10">
        <div className="rise mb-8 grid h-16 w-16 place-items-center rounded-lg bg-primary shadow-card">
          <span className="h-8 w-8 rounded-pill border-[5px] border-primary-ink" />
        </div>
        <h1 data-testid="login-title" className="rise text-4xl font-extrabold tracking-tight sm:text-5xl" style={{ animationDelay: '60ms' }}>
          DealTracker
        </h1>
        <p data-testid="login-tagline" className="rise mt-3 text-base text-muted" style={{ animationDelay: '120ms' }}>
          Every review deal, refund and deadline in one place, so no rupee slips through.
        </p>
      </div>

      <div className="rise pb-10" style={{ animationDelay: '180ms' }}>
        {error && (
          <p data-testid="login-error" role="alert" className="mb-4 rounded-sm bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">
            {ERRORS[error] ?? ERRORS.oauth_failed}
          </p>
        )}
        <a
          data-testid="login-google-button"
          href={googleLoginHref(next)}
          className="flex h-14 w-full items-center justify-center gap-3 rounded-pill bg-ink text-base font-bold text-bg shadow-card transition-transform active:scale-[0.98]"
        >
          <GoogleMark />
          Continue with Google
        </a>
        <p className="mt-4 text-center text-xs text-muted">Your deals are private to your account.</p>
      </div>
    </div>
  )
}

function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}
